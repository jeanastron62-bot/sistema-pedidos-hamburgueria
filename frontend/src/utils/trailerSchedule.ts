// Réplica do helper puro do backend (backend/src/utils/trailerSchedule.ts) --
// mesmo padrão já usado em deliveryWindow.ts: consome o config já carregado
// no estado do cliente, sem round-trip extra ao servidor a cada tick.
export function isEffectivelyOpen(
  config: { trailerOpen: boolean; scheduledCloseAt: string | null },
  now: Date = new Date()
): boolean {
  if (!config.trailerOpen) return false;
  if (config.scheduledCloseAt === null) return false; // nunca "aberto sem fim"
  return now < new Date(config.scheduledCloseAt);
}

export function minutesUntilClose(scheduledCloseAt: string | null, now: Date = new Date()): number | null {
  if (scheduledCloseAt === null) return null;
  return Math.round((new Date(scheduledCloseAt).getTime() - now.getTime()) / 60000);
}
