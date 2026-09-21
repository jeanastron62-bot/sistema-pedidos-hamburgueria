import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';
import { Role } from '@prisma/client';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await usersService.listUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const approve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { approved } = req.body;
    
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'O campo approved deve ser booleano' });
    }

    const updated = await usersService.approveUser(id, approved, req.user!);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { role } = req.body;

    if (!Object.values(Role).includes(role)) {
      return res.status(400).json({ error: 'Papel inválido' });
    }

    const updated = await usersService.updateRole(id, role as Role, req.user!);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const result = await usersService.deleteUser(id, req.user!);
    res.json(result);
  } catch (error) {
    next(error);
  }
};
