// Self-check manual (sem framework de teste no frontend): roda com
// `node --experimental-strip-types scripts/periods.selfcheck.ts` dentro de
// frontend/. Cobre as regras de fronteira comercial (semana/mês/ano) com
// datas sintéticas -- sem rede, sem DOM, só a matemática pura.
// Vive fora de src/ porque tsconfig.app.json (o projeto do navegador) não
// inclui tipos do Node -- só tsconfig.node.json os tem, e esse só cobre
// vite.config.ts.
import assert from 'node:assert';
import { getPeriodRange, getCustomRange, getGranularityForPeriod } from '../src/utils/periods.ts';

// Âncora: terça-feira 2026-07-21 12:00 Brasília -> 15:00 UTC (turno de "hoje").
const shiftRange = {
  from: new Date('2026-07-21T15:00:00.000Z'),
  to: new Date('2026-07-22T14:59:59.999Z'),
};

// hoje == a própria âncora
assert.deepStrictEqual(getPeriodRange('hoje', shiftRange), shiftRange);

// ontem == âncora -24h, nos dois extremos
const ontem = getPeriodRange('ontem', shiftRange);
assert.strictEqual(ontem.from.toISOString(), '2026-07-20T15:00:00.000Z');
assert.strictEqual(ontem.to.toISOString(), '2026-07-21T14:59:59.999Z');

// semana: âncora já é terça -> daysSinceTuesday = 0, from == a própria âncora
const semana = getPeriodRange('semana', shiftRange);
assert.strictEqual(semana.from.toISOString(), shiftRange.from.toISOString());
assert.strictEqual(semana.to.toISOString(), shiftRange.to.toISOString());

// mês: dia 21 -> 20 dias de volta até dia 1 às 12:00 Brasília (15:00 UTC)
const mes = getPeriodRange('mes', shiftRange);
assert.strictEqual(mes.from.toISOString(), '2026-07-01T15:00:00.000Z');

// ano: dia-do-ano de 21/07 -> volta até 1º de janeiro 12:00 Brasília (15:00 UTC)
const ano = getPeriodRange('ano', shiftRange);
assert.strictEqual(ano.from.toISOString(), '2026-01-01T15:00:00.000Z');

// segunda-feira (um dia antes da terça-âncora) -> semana deve voltar 6 dias
const mondayShift = {
  from: new Date('2026-07-20T15:00:00.000Z'), // segunda 2026-07-20 12:00 BRT
  to: new Date('2026-07-21T14:59:59.999Z'),
};
const semanaSegunda = getPeriodRange('semana', mondayShift);
assert.strictEqual(semanaSegunda.from.toISOString(), '2026-07-14T15:00:00.000Z'); // terça anterior

// Personalizado: datas de calendário puras, offset -03:00 explícito
const custom = getCustomRange('2026-07-01', '2026-07-19');
assert.strictEqual(custom.from.toISOString(), '2026-07-01T03:00:00.000Z');
assert.strictEqual(custom.to.toISOString(), '2026-07-20T02:59:59.999Z');

// granularidade por período
assert.strictEqual(getGranularityForPeriod('hoje'), 'hour');
assert.strictEqual(getGranularityForPeriod('ontem'), 'hour');
assert.strictEqual(getGranularityForPeriod('semana'), 'day');
assert.strictEqual(getGranularityForPeriod('mes'), 'day');
assert.strictEqual(getGranularityForPeriod('ano'), 'month');

console.log('periods.selfcheck: OK');
