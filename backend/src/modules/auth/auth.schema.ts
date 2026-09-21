import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  username: z.string().trim().min(3, 'Usuário deve ter pelo menos 3 caracteres').max(30),
  password: z.string().trim().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  role: z.nativeEnum(Role),
});
