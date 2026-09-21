import { z } from 'zod';
import { parseLocalDayBoundary } from '../../utils/shift';

const MAX_RANGE_DAYS = 400;

export const summaryQuerySchema = z
  .object({
    from: z.string().min(1, 'from é obrigatório'),
    to: z.string().min(1, 'to é obrigatório'),
    granularity: z.enum(['hour', 'day', 'month']),
  })
  .transform((data, ctx) => {
    const from = parseLocalDayBoundary(data.from, false);
    const to = parseLocalDayBoundary(data.to, true);

    if (Number.isNaN(from.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from inválido', path: ['from'] });
      return z.NEVER;
    }
    if (Number.isNaN(to.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'to inválido', path: ['to'] });
      return z.NEVER;
    }
    if (from.getTime() > to.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from deve ser anterior ou igual a to', path: ['from'] });
      return z.NEVER;
    }

    const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Intervalo não pode exceder ${MAX_RANGE_DAYS} dias`,
        path: ['to'],
      });
      return z.NEVER;
    }

    return { from, to, granularity: data.granularity };
  });

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
