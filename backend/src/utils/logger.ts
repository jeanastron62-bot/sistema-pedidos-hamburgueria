import { PrismaClient, Prisma } from '@prisma/client';

type LogData = {
  userId?: number | null;
  username: string;
  action: string;
  details?: any;
};

export async function createLog(tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">, data: LogData) {
  await tx.log.create({
    data: {
      userId: data.userId,
      username: data.username,
      action: data.action,
      details: data.details ? (data.details as Prisma.InputJsonValue) : Prisma.JsonNull
    }
  });
}
