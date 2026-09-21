import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { registerSchema } from './auth.schema';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password, role } = registerSchema.parse(req.body);
    await authService.registerUser(username, password, role);
    res.json({ message: "Cadastro realizado. Aguarde aprovação do administrador." });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    const token = await authService.loginUser(username, password);
    res.json({ token });
  } catch (error) {
    next(error);
  }
};
