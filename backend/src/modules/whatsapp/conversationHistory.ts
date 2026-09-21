import { prisma } from '../../config/prisma';
import type { WhatsappMessage } from '@prisma/client';

const SESSION_TTL_MINUTES = 60;

export async function getRecentHistory(conversationId: number) {
  const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
    where: { id: conversationId },
  });

  const sessionStart = conversation.lastInboundAt
    ? new Date(conversation.lastInboundAt.getTime() - SESSION_TTL_MINUTES * 60_000)
    : new Date(0);

  // Se a última mensagem anterior foi há mais de 1h, não existe "sessão
  // anterior" -- a busca abaixo já não vai encontrar nada além da mensagem
  // atual, o que é o comportamento certo (sessão nova, sem contexto velho).
  //
  // Fase 17.2 (correção) -- desde que sendWhatsappText passou a gravar
  // PENDENTE antes do fetch e FALHOU em vez de apagar em caso de erro, esta
  // query passou a devolver mensagens OUT que o cliente nunca recebeu. O
  // bot lia isso como fala própria e respondia "como eu te falei" sobre uma
  // mensagem que ficou só no banco. IN não tem esse risco (ela só existe
  // porque chegou); a exclusão vale só pra OUT.
  //
  // deliveryStatus nulo entra porque é mensagem anterior a esta correção
  // (nunca recebeu esse campo) -- tratar como ENVIADA é a leitura correta:
  // o create() antigo só rodava depois da Graph confirmar.
  return prisma.whatsappMessage.findMany({
    where: {
      conversationId,
      createdAt: { gte: sessionStart },
      OR: [
        { direction: 'IN' },
        { direction: 'OUT', deliveryStatus: 'ENVIADA' },
        { direction: 'OUT', deliveryStatus: null },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

// Mensagem de mídia sem transcrição (áudio/imagem, fora de escopo desta fase)
// não tem `content` -- não entra no histórico mandado pra OpenAI, mensagem
// vazia só custaria token à toa e confundiria o modelo.
export function toChatFormat(history: WhatsappMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history
    .filter((m): m is WhatsappMessage & { content: string } => m.content !== null)
    .map((m) => ({ role: m.direction === 'IN' ? 'user' : 'assistant', content: m.content }));
}
