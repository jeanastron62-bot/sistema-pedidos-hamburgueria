import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { decryptToken } from '../../utils/tokenCrypto';

// O modelo escreve markdown padrão (** pra negrito, #, ```, -, [texto](url)),
// mas o WhatsApp só entende um subconjunto próprio: *negrito* (asterisco
// simples), _itálico_, ~riscado~. Sem essa conversão o cliente vê os símbolos
// literais na tela (ex.: "**Combo**" em vez de negrito de verdade).
function toWhatsappFormatting(text: string): string {
  return text
    // **negrito** -> *negrito* -- precisa rodar antes de qualquer coisa que
    // dependa de asterisco simples já estar no formato final.
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // ```bloco de código``` -> texto puro, sem os delimitadores
    .replace(/```([\s\S]*?)```/g, '$1')
    // ## Título -> Título, sem o(s) #
    .replace(/^#{1,6}\s+/gm, '')
    // [texto](url) -> texto: url -- o WhatsApp já linkifica url solta
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    // - item / * item (lista markdown) -> • item
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
}

// Fase 15.3 -- resolve QUAL conta responde por phoneNumberId (o número em
// que a mensagem do cliente chegou), nunca "pega a conta ativa" -- com duas
// WABAs conectadas, a segunda abordagem responde pelo número errado, em
// silêncio (ver doc da Fase 15, "Ponto de atenção").
//
// Fallback pro par de variáveis de ambiente global (Fase 13/14) enquanto
// nenhuma WhatsappBusinessAccount foi conectada de verdade ainda -- remover
// esse fallback e as duas variáveis do .env.example quando a Fase 15 estiver
// ligada de ponta a ponta em produção.
async function resolveSendCredentials(
  phoneNumberId: string | undefined
): Promise<{ accessToken: string; phoneNumberId: string }> {
  if (phoneNumberId) {
    const account = await prisma.whatsappBusinessAccount.findFirst({
      where: { phoneNumberId, active: true },
    });
    if (account) {
      return { accessToken: decryptToken(account.accessToken), phoneNumberId: account.phoneNumberId };
    }
    // Chegou uma origem conhecida (phoneNumberId do webhook) e ela não bateu
    // com nenhuma conta ativa -- inexistente ou desativada. Cair pro
    // fallback do env AQUI é exatamente o bug do comentário acima: responde
    // pelo número global errado, em silêncio, só que disparado por conta
    // ausente/desativada em vez de ambiguidade entre duas ativas.
    //
    // Só é seguro cair pro env se NENHUMA conta jamais foi conectada -- aí
    // o sistema inteiro ainda está no modo legado (Fase 13/14) e o env É a
    // única credencial que existe. Se já existe pelo menos uma conta na
    // tabela, uma origem que não bate é erro, não motivo de fallback:
    // bug corrigido depois de confirmado ainda aberto (ver
    // LESSONS_LEARNED_WHATSAPP_COEXISTENCE.md, R15).
    const existeAlgumaConta = await prisma.whatsappBusinessAccount.findFirst({ select: { id: true } });
    if (existeAlgumaConta) {
      throw new Error(
        `Nenhuma conta WhatsApp ativa para phoneNumberId=${phoneNumberId} -- conta inexistente ou ` +
          'desativada. Não caio para as credenciais globais: enviaria pelo número errado em silêncio.'
      );
    }
  }
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) {
    throw new Error(
      'Nenhuma conta WhatsApp conectada e META_ACCESS_TOKEN/META_PHONE_NUMBER_ID não configurados -- impossível enviar mensagem.'
    );
  }
  return { accessToken: env.META_ACCESS_TOKEN, phoneNumberId: env.META_PHONE_NUMBER_ID };
}

export async function sendWhatsappText(
  to: string,
  conversationId: number,
  text: string,
  sourcePayload?: unknown,
  originPhoneNumberId?: string,
  // Fase 17 -- quem da equipe mandou, quando a mensagem sai pelo painel.
  // null/undefined = saiu do bot, que é o caso de todos os chamadores
  // anteriores a esta fase.
  sentByName?: string
) {
  const { accessToken, phoneNumberId } = await resolveSendCredentials(originPhoneNumberId);
  const formattedText = toWhatsappFormatting(text);

  // Fase 17.2 (correção) -- grava PENDENTE antes de chamar a Graph API. Antes
  // desta correção a linha só existia depois do sucesso: se o processo caísse entre a
  // Graph confirmar o envio e o create() rodar, a mensagem que o cliente
  // recebeu desaparecia do banco. Com o registro antes, o pior caso passa a
  // ser "linha pendente órfã", visível e recuperável, nunca "mensagem
  // fantasma".
  const pending = await prisma.whatsappMessage.create({
    data: {
      conversationId,
      direction: 'OUT',
      content: formattedText,
      sentByName: sentByName ?? null,
      deliveryStatus: 'PENDENTE',
      rawPayload: (sourcePayload ?? {}) as Prisma.InputJsonValue,
    },
  });

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(
      `${env.META_GRAPH_BASE_URL}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: formattedText },
        }),
      }
    );
  } catch (err) {
    // Erro de rede -- nem chegou a ter resposta da Graph. Marca FALHOU em vez
    // de apagar: a equipe vê que a tentativa existiu e por que não saiu.
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.whatsappMessage.update({
      where: { id: pending.id },
      data: { deliveryStatus: 'FALHOU', failureReason: reason },
    });
    throw new Error(`Falha ao enviar mensagem no WhatsApp: ${reason}`);
  }

  const result = await response.json();
  if (!response.ok) {
    const reason = JSON.stringify(result);
    await prisma.whatsappMessage.update({
      where: { id: pending.id },
      data: { deliveryStatus: 'FALHOU', failureReason: reason },
    });
    throw new Error(`Falha ao enviar mensagem no WhatsApp: ${reason}`);
  }

  await prisma.whatsappMessage.update({
    where: { id: pending.id },
    data: {
      deliveryStatus: 'ENVIADA',
      waMessageId: result.messages?.[0]?.id ?? null,
      rawPayload: (sourcePayload ?? result) as Prisma.InputJsonValue,
    },
  });
}
