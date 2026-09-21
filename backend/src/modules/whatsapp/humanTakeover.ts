import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { getIO } from '../../socket/socket';
import { extractTextContent } from './whatsapp.service';

// Decisão de negócio confirmada com o usuário em 2026-08-06 (não é
// suposição do agente -- o doc da Fase 15 pedia explicitamente pra não
// escolher isso sozinho). Reconfirmada em 2026-09-18, na Fase 17, com base
// na operação: o atendimento se resolve em ~10 min, então 30 é folga de 3x.
//
// CONSEQUÊNCIA CONHECIDA E ACEITA, não descuido: 30 é MENOR que o
// SESSION_TTL_MINUTES = 60 de conversationHistory.ts. Ou seja, quando o bot
// reassume por esta regra, a sessão anterior ainda está viva e ele recebe no
// contexto o histórico daquela conversa -- inclusive as mensagens que a
// EQUIPE escreveu pelo painel. Foi pesado contra a alternativa (esperar mais
// de 1h pro bot voltar com a ficha limpa) e o custo de deixar o cliente sem
// resposta pesou mais. Quem for mexer nisso depois precisa saber que a
// sobreposição é intencional.
export const HUMAN_TAKEOVER_UNPAUSE_MINUTES = 30;

// Fase 17 -- pausa de segurança do próprio bot (ver pauseForHumanReview)
// NUNCA despausa sozinha. Despausar automático aqui recria o loop do T25 com
// período de 30 minutos: o bot volta, falha exatamente do mesmo jeito, pausa
// de novo, para sempre. Só o "Retomar bot" manual tira dessa pausa.
const MOTIVOS_SEM_DESPAUSA_AUTOMATICA = new Set(['JSON_LEAK', 'TOOL_LOOP_EXHAUSTED']);

type MessageEcho = { to: string; id: string; type?: unknown; text?: unknown } & Record<string, unknown>;

// Fase 15.4 -- mesmo padrão preguiçoso do TTL de sessão (Fase 14.5): sem cron,
// a "despausa" é só a consequência de checar a idade de um instante na
// chegada da próxima mensagem do cliente.
//
// Fase 17 -- passou a cobrir DOIS casos, não um:
//
//   a) alguém respondeu e a conversa parou  -> mede a partir de
//      humanRepliedAt. Antes isto só era escrito pelo eco da coexistência,
//      que nunca funcionou, então a regra nunca rodou em produção. Agora
//      POST /conversations/:id/messages também escreve, então ela passa a ser
//      alcançada de verdade pelo atendimento do painel.
//
//   b) NINGUÉM respondeu (humanRepliedAt nulo) -> mede a partir da última
//      mensagem anterior da conversa. Sem este caso, conversa que o bot
//      transferiu e ninguém pegou ficava pausada pra sempre: nem bot nem
//      humano respondiam o cliente. É o pior desfecho possível e era um bug
//      vivo antes desta fase.
//
// ARMADILHA DE ORDEM DE EXECUÇÃO (a fase avisa, e é real): em receive(),
// storeInboundMessages grava o IN novo ANTES deste loop. Se `lastMessageAt`
// vier da mensagem recém-gravada, o intervalo dá zero e a despausa NUNCA
// dispara, em silêncio. Por isso o instante é capturado antes da escrita, em
// snapshotBeforeInbound(), e chega aqui por parâmetro -- nunca é lido de
// dentro desta função.
export function shouldAutoUnpause(
  conversation: {
    botPaused: boolean;
    humanRepliedAt: Date | null;
    handoffMotivo?: string | null;
  },
  lastMessageAt: Date | null = null,
  now: Date = new Date()
): boolean {
  if (!conversation.botPaused) return false;
  if (conversation.handoffMotivo && MOTIVOS_SEM_DESPAUSA_AUTOMATICA.has(conversation.handoffMotivo)) {
    return false;
  }

  // humanRepliedAt tem precedência: se a equipe respondeu, o relógio começa
  // na resposta dela, não na mensagem do cliente que veio antes.
  const referencia = conversation.humanRepliedAt ?? lastMessageAt;
  if (referencia === null) return false;

  const minutesSince = (now.getTime() - referencia.getTime()) / 60_000;
  return minutesSince > HUMAN_TAKEOVER_UNPAUSE_MINUTES;
}

// Upsert próprio (não reaproveita whatsapp.service.findOrCreateConversation):
// aquela função sempre bate lastInboundAt = now, correto pra mensagem que o
// CLIENTE mandou. Um eco é o oposto -- é o NEGÓCIO respondendo -- então não
// pode contaminar lastInboundAt (usado pelo TTL de sessão da Fase 14.5) com
// atividade que não é do cliente.
async function findOrCreateConversationForEcho(phone: string) {
  return prisma.whatsappConversation.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });
}

// Fase 15.4 -- o garçom/atendente respondeu pelo app WhatsApp Business
// (Coexistence); o Meta espelha essa mensagem pro webhook via
// smb_message_echoes. Pausa o bot de verdade, grava a mensagem como OUT (o
// histórico mandado à OpenAI precisa saber o que o humano já disse) e loga.
export async function handleMessageEcho(echo: MessageEcho): Promise<void> {
  // Guarda contra o eco da mensagem que o PRÓPRIO bot acabou de mandar pela
  // Cloud API: ela volta com o mesmo waMessageId que sendWhatsappText já
  // gravou. Sem isto o bot se pausaria sozinho a cada resposta que desse --
  // o P2002 lá embaixo impede a mensagem duplicada, mas só depois de
  // botPaused já ter virado true, e ninguém desfaz isso. Custo aceitável do
  // outro lado: se o Meta reentregar um eco humano já processado, a pausa
  // não é renovada -- a primeira entrega já pausou, e reentrega só acontece
  // quando o 200 não chegou a tempo.
  if (echo.id) {
    const known = await prisma.whatsappMessage.findUnique({ where: { waMessageId: echo.id } });
    if (known) {
      console.log('[WHATSAPP_ECHO_IGNORED_KNOWN_MESSAGE]', { waMessageId: echo.id });
      return;
    }
  }

  const conversation = await findOrCreateConversationForEcho(echo.to);
  const now = new Date();

  await prisma.whatsappConversation.update({
    where: { id: conversation.id },
    data: { botPaused: true, humanRepliedAt: now },
  });

  try {
    await prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        waMessageId: echo.id ?? null,
        direction: 'OUT',
        content: extractTextContent(echo),
        rawPayload: echo as Prisma.InputJsonValue,
      },
    });
  } catch (err: unknown) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    // waMessageId duplicado -- reentrega do mesmo eco pelo Meta, já processado.
  }

  await createLog(prisma, {
    username: 'WhatsApp Business App',
    action: 'WHATSAPP_HUMAN_TAKEOVER',
    details: { conversationId: conversation.id, phone: echo.to, waMessageId: echo.id ?? null },
  });

  console.log('[WHATSAPP_HUMAN_TAKEOVER]', { conversationId: conversation.id, phone: echo.to });
}

// Fase 16 -- pausa de segurança: o bot falhou de um jeito que ele mesmo não
// resolve (escreveu os argumentos da função no texto em vez de chamar a
// função, ou insistiu em chamar função até estourar o teto de rodadas). Nos
// dois casos ele estava TENTANDO AGIR e não conseguiu -- é mais provável que
// precise de gente do que de outra tentativa. Mesmo princípio do fechamento
// automático do trailer: falhar pro lado seguro.
//
// De propósito NÃO preenche humanRepliedAt: aquele campo é "um humano
// respondeu pelo celular", e é o que a despausa automática de 30 min olha.
// Aqui humano nenhum falou ainda, então a conversa só sai da fila pelo
// "Retomar bot" no painel -- igual à pausa por transferir_para_humano.
export async function pauseForHumanReview(
  conversationId: number,
  motivo: 'JSON_LEAK' | 'TOOL_LOOP_EXHAUSTED',
  phone: string,
  details: Record<string, unknown>
): Promise<void> {
  const resumo =
    motivo === 'JSON_LEAK'
      ? 'O bot tentou acionar uma função e escreveu os dados no texto em vez de executá-la. A ação NÃO aconteceu -- confira o que o cliente pediu.'
      : 'O bot ficou tentando acionar funções sem conseguir responder. Confira o que o cliente pediu.';

  await prisma.whatsappConversation.update({
    where: { id: conversationId },
    // Fase 17 -- handoffAt é gravado nos DOIS caminhos que pausam por handoff
    // (aqui e em dispatchToolCall). Se só um gravasse, a fila e o cronômetro
    // quebrariam em metade dos casos.
    data: { botPaused: true, handoffMotivo: motivo, handoffResumo: resumo, handoffAt: new Date() },
  });

  await createLog(prisma, {
    username: 'Bot WhatsApp',
    action: 'WHATSAPP_BOT_FAILSAFE_PAUSE',
    details: { conversationId, phone, motivo, ...details },
  });

  // Mesmo evento do handoff normal: quem está com o painel aberto precisa ver
  // a conversa entrar na fila em tempo real, e pro atendente a origem da pausa
  // não muda o que ele tem que fazer.
  getIO().of('/staff').emit('whatsapp:handoff', { conversationId, phone, motivo, resumo });

  console.error('[WHATSAPP_BOT_FAILSAFE_PAUSE]', { conversationId, phone, motivo });
}
