import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { JwtPayload } from '../../middleware/auth';

export const listNeighborhoods = async () => {
  return await prisma.neighborhood.findMany({
    orderBy: { name: 'asc' }
  });
};

export const createNeighborhood = async (data: any, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const item = await tx.neighborhood.create({ data });
    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'NEIGHBORHOOD_CREATED',
      details: { id: item.id, name: item.name }
    });
    return item;
  });
};

export const updateNeighborhood = async (id: number, data: any, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const item = await tx.neighborhood.update({
      where: { id },
      data
    });
    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'NEIGHBORHOOD_UPDATED',
      details: { id: item.id, name: item.name }
    });
    return item;
  });
};
