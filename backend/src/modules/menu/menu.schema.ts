import { z } from 'zod';
import { Category } from '@prisma/client';

const requiredChoiceSchema = z.object({
  label: z.string(),
  options: z.array(z.string()).min(1),
}).nullable();

const menuItemBase = z.object({
  name: z.string().min(1),
  category: z.nativeEnum(Category),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Preço inválido'),
  description: z.string().optional().nullable(),
  ingredients: z.array(z.string()).optional(),
  requiredChoice: requiredChoiceSchema.optional(),
});

export const createMenuItemSchema = menuItemBase.strict();
export const updateMenuItemSchema = menuItemBase.partial().strict();
