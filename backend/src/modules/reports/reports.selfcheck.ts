// Self-check manual (sem framework de teste no projeto): roda com
// `npx tsx src/modules/reports/reports.selfcheck.ts` dentro de backend/.
// Cobre a matemática de dinheiro e a validação de período -- a parte pura,
// sem banco. O truncamento SQL (date_trunc +/- 12h) foi verificado por
// derivação manual no comentário de reports.service.ts e precisa de teste de
// integração contra o Postgres real antes de ir pra produção.
import assert from 'node:assert';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { toCents } from '../../utils/money';
import { summaryQuerySchema } from './reports.schema';

// toCents nunca usa Number() * 100 -- Decimal.js em precisão arbitrária
assert.strictEqual(toCents(new Prisma.Decimal('37.00')), 3700);
assert.strictEqual(toCents('19.99'), 1999);
assert.strictEqual(toCents(0.1 + 0.2), 30, 'Decimal deve corrigir o erro de float do JS');
assert.strictEqual(toCents(null), 0);
assert.strictEqual(toCents(undefined), 0);

// from/to obrigatórios, granularity restrita ao enum
const valid = summaryQuerySchema.parse({ from: '2026-07-01', to: '2026-07-19', granularity: 'day' });
assert.ok(valid.from instanceof Date && valid.to instanceof Date);
assert.strictEqual(valid.granularity, 'day');

assert.throws(() => summaryQuerySchema.parse({ from: '2026-07-19', to: '2026-07-01', granularity: 'day' }), ZodError);
assert.throws(() => summaryQuerySchema.parse({ from: '2025-01-01', to: '2026-07-19', granularity: 'day' }), ZodError, '> 400 dias tem que rejeitar');
assert.throws(() => summaryQuerySchema.parse({ from: '2026-07-01', to: '2026-07-19', granularity: 'week' }), ZodError, 'granularity fora do enum tem que rejeitar');

console.log('reports.selfcheck: OK');
