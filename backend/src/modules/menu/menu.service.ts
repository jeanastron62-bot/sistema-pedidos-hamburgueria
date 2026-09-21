import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { JwtPayload } from '../../middleware/auth';

export const listItems = async (includeArchived: boolean) => {
  return await prisma.menuItem.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: { name: 'asc' }
  });
};

export const createItem = async (data: any, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.create({ data });
    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'MENU_ITEM_CREATED',
      details: { id: item.id, name: item.name }
    });
    return item;
  });
};

export const updateItem = async (id: number, data: any, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.update({
      where: { id },
      data
    });
    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'MENU_ITEM_UPDATED',
      details: { id: item.id, name: item.name }
    });
    return item;
  });
};

export const updateAvailability = async (id: number, available: boolean, user: JwtPayload) => {
  if (typeof available !== 'boolean') throw { status: 400, message: 'available deve ser booleano' };

  return await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.update({
      where: { id },
      data: { available }
    });
    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'MENU_AVAILABILITY_CHANGED',
      details: { id: item.id, name: item.name, available }
    });
    return item;
  });
};

export const archiveItem = async (id: number, archived: boolean, user: JwtPayload) => {
  if (typeof archived !== 'boolean') throw { status: 400, message: 'archived deve ser booleano' };

  return await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.update({
      where: { id },
      data: { archived }
    });
    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'MENU_ITEM_ARCHIVED',
      details: { id: item.id, name: item.name, archived }
    });
    return item;
  });
};
