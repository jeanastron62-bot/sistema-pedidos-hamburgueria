const CUTOFF_HOUR = 18; // antes das 18h (00:00–17:59) é a janela bloqueada, salvo extensão ativa
const GRACE_MINUTE = 10; // tolerância vai até 00:10 da madrugada seguinte

// Tolerância de delivery por conversa: quem já estava falando com o bot antes
// da meia-noite tem até 00:10 pra fechar delivery. Devolve esse instante pra
// mensagem recebida entre 18:00 e 23:59, ou null fora dessa faixa -- null
// significa "não escreve", nunca "apaga o que já havia": é justamente por não
// sobrescrever às 00:05 que o valor da última mensagem antes da meia-noite
// sobrevive. Como fica sempre no passado depois de usado, expira sozinho, sem
// precisar de scheduler (o projeto não usa nenhum).
export function computeDeliveryGrace(messageAt: Date): Date | null {
  if (messageAt.getHours() < CUTOFF_HOUR) return null;
  const grace = new Date(messageAt);
  // setHours(24, ...) rola pro dia seguinte sozinho, inclusive virada de mês
  // e de ano.
  grace.setHours(24, GRACE_MINUTE, 0, 0);
  return grace;
}

// deliveryGraceUntil entra em OR com a prorrogação manual do ADM, nunca no
// lugar dela -- uma extensão de +1h clicada às 23:30 vale até 00:30, mais que
// a tolerância de 00:10, e não pode ser encurtada por ela.
//
// Isto aqui relaxa SÓ o corte de horário. Trailer fechado (isEffectivelyOpen)
// e delivery desligado (config.deliveryActive) são checagens anteriores e
// independentes, em orders.service.ts -- tolerância nenhuma passa por cima
// delas.
export function isDeliveryTimeBlocked(
  config: { deliveryExtendedUntil: Date | null },
  now: Date = new Date(),
  deliveryGraceUntil: Date | null = null
): boolean {
  const isBeforeCutoff = now.getHours() < CUTOFF_HOUR;
  const hasActiveExtension = config.deliveryExtendedUntil !== null && now < config.deliveryExtendedUntil;
  const hasActiveGrace = deliveryGraceUntil !== null && now < deliveryGraceUntil;
  return isBeforeCutoff && !hasActiveExtension && !hasActiveGrace;
}
