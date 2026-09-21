import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Erro de validação', details: err.errors });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Já existe um registro com esse valor único.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }
    // Outros códigos do Prisma: não repassar err.message cru (pode vazar nome de
    // coluna/tabela interna) -- devolve mensagem genérica com 400.
    return res.status(400).json({ error: 'Requisição inválida.' });
  }

  const status = err.status || 500;
  const message = err.status ? (err.message || 'Erro interno do servidor') : 'Erro interno do servidor';

  res.status(status).json({ error: message });
};
