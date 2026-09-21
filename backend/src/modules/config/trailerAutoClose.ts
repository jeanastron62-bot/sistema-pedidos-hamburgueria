import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { broadcastConfig } from './config.service';

// Fechamento automático PERSISTIDO.
//
// A Fase 11 decidiu "sem cron": isEffectivelyOpen() passa a responder false
// quando scheduledCloseAt vence, e isso bastava pra site/bot/createOrder. O
// que ficava errado era o MARCADOR: trailerOpen continuava true no banco e no
// painel ("Trailer aberto" ligado com o trailer fechado de verdade), e a dona
// tinha que desligar à mão pra bater com a realidade. Este ticker fecha só
// essa lacuna -- grava trailerOpen=false quando o horário agendado passa, com
// log e broadcast iguais aos do fechamento manual. Toda decisão de "está
// aberto?" continua sendo isEffectivelyOpen(); aqui só se reconcilia o campo.
//
// Único processo Node (CONTEXTO §2.3), então um setInterval basta e não há
// duas instâncias disputando. O updateMany condicional (compare-and-set,
// mesmo padrão de acceptDelivery) garante que abrir/adiar no mesmo instante
// não é sobrescrito: se scheduledCloseAt já foi empurrado pro futuro, o
// where não casa e nada acontece.
export const AUTO_CLOSE_TICK_MS = 30_000;
export const AUTO_CLOSE_ACTOR = 'Sistema (fechamento automático)';

export async function reconcileTrailerAutoClose(now: Date = new Date()): Promise<boolean> {
  const closed = await prisma.$transaction(async (tx) => {
    const res = await tx.systemConfig.updateMany({
      where: {
        id: 1,
        trailerOpen: true,
        // scheduledCloseAt null + trailerOpen true é "aberto sem fim" de dado
        // legado -- isEffectivelyOpen já trata como fechado; o marcador
        // também precisa refletir isso.
        OR: [{ scheduledCloseAt: { lte: now } }, { scheduledCloseAt: null }],
      },
      data: { trailerOpen: false, updatedBy: AUTO_CLOSE_ACTOR },
    });
    if (res.count === 0) return null;

    const conf = await tx.systemConfig.findUniqueOrThrow({ where: { id: 1 } });
    await createLog(tx, {
      username: AUTO_CLOSE_ACTOR,
      action: 'CONFIG_TRAILER_AUTO_CLOSED',
      details: { scheduledCloseAt: conf.scheduledCloseAt, closedAt: now },
    });
    return conf;
  });

  if (!closed) return false;
  console.log('[TRAILER_AUTO_CLOSED]', { scheduledCloseAt: closed.scheduledCloseAt, at: now.toISOString() });
  try {
    broadcastConfig(closed);
  } catch (err) {
    // Socket ainda não inicializado (só em teste) -- o banco já está certo,
    // o painel pega no próximo GET /config.
    console.error('[TRAILER_AUTO_CLOSE_BROADCAST_FAILED]', err);
  }
  return true;
}

export function startTrailerAutoCloseTicker(intervalMs: number = AUTO_CLOSE_TICK_MS): NodeJS.Timeout {
  const tick = () =>
    reconcileTrailerAutoClose().catch((err) => console.error('[TRAILER_AUTO_CLOSE_FAILED]', err));
  tick(); // reconcilia já na subida -- deploy às 3h com trailerOpen preso em true
  const timer = setInterval(tick, intervalMs);
  timer.unref(); // não segura o processo vivo sozinho
  return timer;
}
