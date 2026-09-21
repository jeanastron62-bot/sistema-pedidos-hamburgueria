import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { Role } from '@prisma/client';
import { createLog } from '../../utils/logger';

const ALLOWED_SELF_REGISTER_ROLES: Role[] = [Role.GARCOM, Role.CHAPISTA, Role.ENTREGADOR];

export const registerUser = async (username: string, passwordRaw: string, role: Role) => {
  if (!ALLOWED_SELF_REGISTER_ROLES.includes(role)) {
    throw { status: 400, message: "Papel inválido para auto-cadastro" };
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw { status: 409, message: "Username já existe" };
  }

  const password = await bcrypt.hash(passwordRaw, 12);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        password,
        role,
        approved: false,
      }
    });

    await createLog(tx, {
      userId: user.id,
      username: user.username,
      action: 'REGISTER',
      details: { role }
    });
  });
};

export const loginUser = async (username: string, passwordRaw: string) => {
  const invalidCreds = { status: 401, message: 'Usuário ou senha incorretos' };

  if (!username || !passwordRaw) throw invalidCreds;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw invalidCreds;
  }

  const validPassword = await bcrypt.compare(passwordRaw, user.password);
  if (!validPassword) {
    await prisma.log.create({
      data: {
        userId: user.id,
        username: user.username,
        action: 'LOGIN_FAILED',
      }
    });
    throw invalidCreds;
  }

  if (!user.approved) {
    throw { status: 403, message: 'Conta aguardando aprovação' };
  }

  await prisma.log.create({
    data: {
      userId: user.id,
      username: user.username,
      action: 'LOGIN_SUCCESS',
    }
  });

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any }
  );

  return token;
};
