import { z } from 'zod';

export const updateConfigSchema = z.object({
  trailerOpen: z.boolean().optional(),
  deliveryActive: z.boolean().optional(),
  maxTables: z.number().int().positive().optional(),
  contactPhone: z.string().optional(),
  contactInstagram: z.string().optional(),
  defaultCloseHour: z.number().int().min(0).max(23).optional(),
  closeCeilingHour: z.number().int().min(0).max(23).optional(),
  closedWeekday: z.number().int().min(0).max(6).nullable().optional(),
}).strict();

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const rescheduleCloseSchema = z.object({
  closeAt: z.string().regex(HHMM_REGEX, 'Formato esperado: HH:MM'),
});

export const dailyNoticeSchema = z.object({
  dailyNotice: z.string().max(500).nullable(),
});
