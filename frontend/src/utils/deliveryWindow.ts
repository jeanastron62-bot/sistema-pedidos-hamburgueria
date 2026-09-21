const CUTOFF_HOUR = 18; // antes das 18h (00:00–17:59) é a janela bloqueada, salvo extensão ativa

export function isDeliveryTimeBlocked(deliveryExtendedUntil: string | null, now: Date = new Date()): boolean {
  const isBeforeCutoff = now.getHours() < CUTOFF_HOUR;
  const hasActiveExtension = deliveryExtendedUntil !== null && now < new Date(deliveryExtendedUntil);
  return isBeforeCutoff && !hasActiveExtension;
}
