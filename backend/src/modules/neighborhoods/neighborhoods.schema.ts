import { z } from 'zod';

const neighborhoodBase = z.object({
  name: z.string().min(1),
  deliveryFee: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Taxa inválida'),
  active: z.boolean().optional(),
});

export const createNeighborhoodSchema = neighborhoodBase.strict();
export const updateNeighborhoodSchema = neighborhoodBase.partial().strict();
