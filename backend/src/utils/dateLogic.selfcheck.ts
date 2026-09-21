// Self-check para a lógica pura de datas mais crítica do projeto (dinheiro/horário
// de corte). Sem framework de teste no projeto: roda com `npx tsx src/utils/dateLogic.selfcheck.ts`.
import assert from 'node:assert';
import { isDeliveryTimeBlocked, computeDeliveryGrace } from './deliveryWindow';
import { parseLocalDayBoundary } from './shift';

// isDeliveryTimeBlocked: 4 quadrantes (antes/depois das 18h × com/sem extensão ativa)
assert.strictEqual(isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-16T10:00:00')), true, 'antes das 18h, sem extensão -> bloqueado');
assert.strictEqual(isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-16T20:00:00')), false, 'depois das 18h, sem extensão -> liberado');
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: new Date('2026-07-16T02:00:00') }, new Date('2026-07-16T01:00:00')),
  false,
  'antes das 18h, com extensão ainda vigente -> liberado'
);
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: new Date('2026-07-16T00:30:00') }, new Date('2026-07-16T01:00:00')),
  true,
  'antes das 18h, com extensão já expirada -> bloqueado'
);

// computeDeliveryGrace: só concede entre 18:00 e 23:59, sempre pro 00:10 seguinte
assert.strictEqual(computeDeliveryGrace(new Date('2026-07-16T17:59:00')), null, '17:59 -> fora da faixa, sem tolerância');
assert.deepStrictEqual(
  computeDeliveryGrace(new Date('2026-07-16T18:00:00')),
  new Date('2026-07-17T00:10:00'),
  '18:00 -> tolerância até o 00:10 seguinte'
);
assert.deepStrictEqual(
  computeDeliveryGrace(new Date('2026-07-16T23:59:00')),
  new Date('2026-07-17T00:10:00'),
  '23:59 -> tolerância até o 00:10 seguinte'
);
assert.strictEqual(computeDeliveryGrace(new Date('2026-07-17T00:05:00')), null, '00:05 -> fora da faixa, não sobrescreve o que já havia');
assert.deepStrictEqual(
  computeDeliveryGrace(new Date('2026-12-31T22:00:00')),
  new Date('2027-01-01T00:10:00'),
  'virada de ano -> 00:10 do dia seguinte'
);

// isDeliveryTimeBlocked com tolerância de conversa (deliveryGraceUntil)
const GRACE = new Date('2026-07-17T00:10:00');
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-16T23:59:00'), GRACE),
  false,
  '23:59 com tolerância -> liberado (já liberado pelo corte, tolerância não atrapalha)'
);
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-17T00:05:00'), GRACE),
  false,
  '00:05 com tolerância vigente -> liberado'
);
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-17T00:05:00'), null),
  true,
  '00:05 sem tolerância -> bloqueado'
);
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-17T00:11:00'), GRACE),
  true,
  '00:11 com tolerância expirada -> bloqueado'
);
// Tolerância e prorrogação manual são OR: a mais generosa vale. Extensão até
// 00:30 não pode ser encurtada pela tolerância de 00:10.
assert.strictEqual(
  isDeliveryTimeBlocked(
    { deliveryExtendedUntil: new Date('2026-07-17T00:30:00') },
    new Date('2026-07-17T00:20:00'),
    GRACE
  ),
  false,
  '00:20 com tolerância expirada mas extensão manual vigente -> liberado'
);
assert.strictEqual(
  isDeliveryTimeBlocked(
    { deliveryExtendedUntil: new Date('2026-07-17T00:05:00') },
    new Date('2026-07-17T00:08:00'),
    GRACE
  ),
  false,
  '00:08 com extensão manual expirada mas tolerância vigente -> liberado'
);

// parseLocalDayBoundary: datas puras (sem horário) devem virar limites do dia local, não UTC
const from = parseLocalDayBoundary('2026-07-16', false);
const to = parseLocalDayBoundary('2026-07-16', true);
assert.strictEqual(from.getHours(), 0, 'início do dia deve ser 00:00 local');
assert.strictEqual(from.getMinutes(), 0);
assert.strictEqual(to.getHours(), 23, 'fim do dia deve ser 23:59:59.999 local');
assert.strictEqual(to.getMilliseconds(), 999);
assert.ok(from < to);

// String com horário explícito deve ser respeitada como veio (não reescrita para meia-noite/fim do dia)
const withTime = parseLocalDayBoundary('2026-07-16T15:30:00', false);
assert.strictEqual(withTime.getHours(), 15);
assert.strictEqual(withTime.getMinutes(), 30);

console.log('dateLogic.selfcheck: OK');
