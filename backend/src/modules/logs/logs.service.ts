import { prisma } from '../../config/prisma';
import { parseLocalDayBoundary } from '../../utils/shift';

export const logsService = {
  async listLogs(query: any) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.action) where.action = query.action;
    if (query.username) where.username = { contains: query.username, mode: 'insensitive' };
    if (query.from && query.to) {
      where.createdAt = {
        gte: parseLocalDayBoundary(query.from, false),
        lte: parseLocalDayBoundary(query.to, true)
      };
    }

    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { role: true } } }
      }),
      prisma.log.count({ where })
    ]);

    return {
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  async exportLogs(query: any) {
    const where: any = {};
    if (query.action) where.action = query.action;
    if (query.username) where.username = { contains: query.username, mode: 'insensitive' };
    if (query.from && query.to) {
      where.createdAt = {
        gte: parseLocalDayBoundary(query.from, false),
        lte: parseLocalDayBoundary(query.to, true)
      };
    }

    return prisma.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500, // Limite para evitar OOM (estouro de memória)
      include: { user: { select: { role: true } } }
    });
  }
};
