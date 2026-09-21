import { prisma } from '../../config/prisma';

const WINDOW_MINUTES = 10;
const MAX_INBOUND_PER_WINDOW = 20;

export async function isRateLimited(phone: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const count = await prisma.whatsappMessage.count({
    where: {
      direction: 'IN',
      createdAt: { gte: since },
      conversation: { phone },
    },
  });
  return count > MAX_INBOUND_PER_WINDOW;
}
