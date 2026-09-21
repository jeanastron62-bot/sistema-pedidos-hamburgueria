// Mesmo espírito de deliveryWindow.ts: função pura, sem I/O, sem estado. Sem
// scheduler -- o "fechamento" é só a consequência de isEffectivelyOpen passar
// a responder false na próxima requisição que checar.
export function isEffectivelyOpen(
  config: { trailerOpen: boolean; scheduledCloseAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!config.trailerOpen) return false;
  if (config.scheduledCloseAt === null) return false; // nunca "aberto sem fim"
  return now < config.scheduledCloseAt;
}

export function minutesUntilClose(
  scheduledCloseAt: Date | null,
  now: Date = new Date()
): number | null {
  if (scheduledCloseAt === null) return null;
  return Math.round((scheduledCloseAt.getTime() - now.getTime()) / 60000);
}

// Próxima ocorrência de defaultCloseHour a partir de `now`, em horário local
// (TZ=America/Sao_Paulo já é variável de ambiente do processo -- setHours()
// já opera no fuso certo, sem conversão manual). Se a hora de hoje já passou,
// cai pro dia seguinte.
export function computeNextScheduledClose(defaultCloseHour: number, now: Date = new Date()): Date {
  const candidate = new Date(now);
  candidate.setHours(defaultCloseHour, 0, 0, 0);
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}
