import { prisma } from '../../config/prisma';
import { Role } from '@prisma/client';
import { createLog } from '../../utils/logger';

function isProtectedUser(user: { id: number; username: string }): boolean {
  return user.username === 'tecnico' || user.id === 1;
}

export const usersService = {
  async listUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        approved: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { id: 'asc' }
    });
  },

  async approveUser(id: number, approved: boolean, reqUser: any) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };

    if (!approved && isProtectedUser(user)) {
      throw { status: 403, message: 'Esta conta é protegida' };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { approved },
        select: { id: true, username: true, role: true, approved: true }
      });
      await createLog(tx, {
        userId: reqUser.userId,
        username: reqUser.username,
        action: approved ? 'USER_APPROVED' : 'USER_REVOKED',
        details: { targetUserId: id, targetUsername: u.username }
      });
      return u;
    });
    return updated;
  },

  async updateRole(id: number, role: Role, reqUser: any) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };

    // Regra técnica intransponível
    if (isProtectedUser(user)) {
       throw { status: 403, message: 'Esta conta é protegida' };
    }

    if (reqUser.role === 'ADM' && (role === 'ADM' || role === 'TI')) {
       throw { status: 403, message: 'Apenas usuários TI podem conceder privilégios ADM ou TI.' };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { role },
        select: { id: true, username: true, role: true, approved: true }
      });
      await createLog(tx, {
        userId: reqUser.userId,
        username: reqUser.username,
        action: 'USER_ROLE_CHANGED',
        details: { targetUserId: id, targetUsername: u.username, newRole: role }
      });
      return u;
    });
    return updated;
  },

  async deleteUser(id: number, reqUser: any) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };

    // Regra técnica intransponível
    if (isProtectedUser(user)) {
       await prisma.$transaction(async (tx) => {
           await createLog(tx, {
              userId: reqUser.userId,
              username: reqUser.username,
              action: 'USER_DELETION_BLOCKED',
              details: { targetUserId: id, targetUsername: user.username }
           });
       });
       throw { status: 403, message: 'Esta conta é protegida' };
    }

    await prisma.$transaction(async (tx) => {
       await tx.user.delete({ where: { id } });
       await createLog(tx, {
         userId: reqUser.userId,
         username: reqUser.username,
         action: 'USER_DELETED',
         details: { targetUserId: id, targetUsername: user.username }
       });
    });
    
    return { success: true };
  }
};
