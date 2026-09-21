import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { JwtPayload } from '../../middleware/auth';
import { computeNextScheduledClose } from '../../utils/trailerSchedule';
import { getIO } from '../../socket/socket';

type SystemConfigRow = Awaited<ReturnType<typeof getConfig>>;

// Vivia no controller; agora também é chamado pelo fechamento automático
// (trailerAutoClose.ts), que não passa por requisição HTTP nenhuma.
export function broadcastConfig(conf: SystemConfigRow) {
  const io = getIO();
  io.of('/staff').emit('system:config_changed', conf);
  io.of('/public').emit('system:public_config', {
    trailerOpen: conf.trailerOpen,
    scheduledCloseAt: conf.scheduledCloseAt,
    deliveryActive: conf.deliveryActive,
    deliveryExtendedUntil: conf.deliveryExtendedUntil,
    maxTables: conf.maxTables
  });
}

export const getConfig = async () => {
  return prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { updatedBy: 'system', contactPhone: '', contactInstagram: '' }
  });
};

export const updateConfig = async (data: any, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const current = await tx.systemConfig.findUnique({ where: { id: 1 } });

    // Mesma regra de abertura usada em openTrailer -- virar true sempre
    // (re)agenda o fechamento. Não existe um segundo caminho que abre sem
    // agendar, senão o estado "aberto sem fim" volta por aqui.
    const isOpening = data.trailerOpen === true && current?.trailerOpen !== true;
    const extra = isOpening
      ? { scheduledCloseAt: computeNextScheduledClose(data.defaultCloseHour ?? current?.defaultCloseHour ?? 2) }
      : {};

    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: {
        ...data,
        ...extra,
        updatedBy: user.username
      },
      create: {
        contactPhone: '',
        contactInstagram: '',
        ...data,
        ...extra,
        updatedBy: user.username
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_UPDATED',
      details: data
    });

    return conf;
  });
};

export const extendDelivery = async (user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const current = await tx.systemConfig.findUnique({ where: { id: 1 } });
    const candidate = new Date(Date.now() + 60 * 60 * 1000);
    const currentUntil = current?.deliveryExtendedUntil ?? null;
    const newUntil = currentUntil && currentUntil > candidate ? currentUntil : candidate;

    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: { deliveryExtendedUntil: newUntil, updatedBy: user.username },
      create: {
        deliveryExtendedUntil: newUntil,
        updatedBy: user.username,
        contactPhone: '',
        contactInstagram: ''
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_DELIVERY_EXTENDED',
      details: { extendedUntil: newUntil, role: user.role }
    });

    return conf;
  });
};

// Fase 11 -- endpoints dedicados de abrir/fechar/adiar, acessíveis a
// GARCOM/CHAPISTA/ADM/TI (não só ADM/TI, que já tinham acesso via updateConfig
// genérico). "Reabrir" não é uma função separada -- é a mesma chamada de
// openTrailer, porque é a mesma transição de "abrir pela primeira vez".
export const openTrailer = async (user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const current = await tx.systemConfig.findUnique({ where: { id: 1 } });
    const defaultCloseHour = current?.defaultCloseHour ?? 2;
    const scheduledCloseAt = computeNextScheduledClose(defaultCloseHour);

    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: { trailerOpen: true, scheduledCloseAt, updatedBy: user.username },
      create: {
        trailerOpen: true,
        scheduledCloseAt,
        updatedBy: user.username,
        contactPhone: '',
        contactInstagram: ''
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_TRAILER_OPENED',
      details: { scheduledCloseAt, role: user.role }
    });

    return conf;
  });
};

export const closeTrailer = async (user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: { trailerOpen: false, updatedBy: user.username },
      create: {
        trailerOpen: false,
        updatedBy: user.username,
        contactPhone: '',
        contactInstagram: ''
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_TRAILER_CLOSED',
      details: { role: user.role }
    });

    return conf;
  });
};

// Adia scheduledCloseAt pra um horário HH:MM dentro do mesmo dia já agendado
// (o dia seguinte à abertura), respeitando o teto closeCeilingHour -- é esse
// teto, validado sempre no servidor, que impede o estado "aberto sem fim".
export const rescheduleClose = async (closeAtHHMM: string, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const current = await tx.systemConfig.findUnique({ where: { id: 1 } });
    if (!current?.scheduledCloseAt) {
      throw { status: 400, message: 'Trailer não tem fechamento agendado.' };
    }

    const [hh, mm] = closeAtHHMM.split(':').map(Number);
    const ceilingHour = current.closeCeilingHour;
    if (hh * 60 + mm > ceilingHour * 60) {
      throw { status: 400, message: `Horário fora do teto permitido (00:00–${String(ceilingHour).padStart(2, '0')}:00).` };
    }

    const previousScheduledCloseAt = current.scheduledCloseAt;
    const newScheduledCloseAt = new Date(previousScheduledCloseAt);
    newScheduledCloseAt.setHours(hh, mm, 0, 0);

    const conf = await tx.systemConfig.update({
      where: { id: 1 },
      data: { scheduledCloseAt: newScheduledCloseAt, updatedBy: user.username }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_CLOSE_RESCHEDULED',
      details: { previousScheduledCloseAt, newScheduledCloseAt, role: user.role }
    });

    return conf;
  });
};

export const updateDailyNotice = async (dailyNotice: string | null, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const dailyNoticeUpdatedAt = new Date();
    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: { dailyNotice, dailyNoticeUpdatedAt, updatedBy: user.username },
      create: {
        dailyNotice,
        dailyNoticeUpdatedAt,
        updatedBy: user.username,
        contactPhone: '',
        contactInstagram: ''
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_DAILY_NOTICE_UPDATED',
      details: { dailyNotice, role: user.role }
    });

    return conf;
  });
};
