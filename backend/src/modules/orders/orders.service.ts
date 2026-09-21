import { Prisma, OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { getShiftRange, parseLocalDayBoundary } from '../../utils/shift';
import { getIO } from '../../socket/socket';
import { isDeliveryTimeBlocked } from '../../utils/deliveryWindow';
import { isEffectivelyOpen } from '../../utils/trailerSchedule';
import { normalizePhone } from '../../utils/phone';

const ACTIVE_STATUSES: OrderStatus[] = ['AGUARDANDO', 'PREPARANDO', 'PRONTO', 'EM_ROTA'];

const ORDER_INCLUDE = {
  items: { include: { extras: true } },
  neighborhood: true,
  createdBy: { select: { id: true, username: true, role: true } }
};

const TX_TIMEOUT = { timeout: 15000 };

export const ordersService = {
  // deliveryGraceUntil é a tolerância de delivery da CONVERSA do WhatsApp --
  // regra de conversa, não do site: só o bot passa esse argumento
  // (whatsapp.service.ts), o cardápio público nunca passa e segue com o corte
  // de horário inalterado.
  async createOrder(
    data: any,
    userId?: number,
    username?: string,
    clientOnline = false,
    deliveryGraceUntil: Date | null = null
  ) {
    const config = await prisma.systemConfig.findUnique({ where: { id: 1 } });
    if (!config) throw { status: 500, message: 'Configuração não encontrada' };

    if (!isEffectivelyOpen(config)) {
      throw { status: 403, message: 'Trailer fechado. Não estamos aceitando pedidos no momento.' };
    }

    if (data.type === 'DELIVERY') {
      if (!config.deliveryActive) {
        throw { status: 403, message: 'Delivery indisponível no momento.' };
      }
      if (clientOnline && isDeliveryTimeBlocked(config, new Date(), deliveryGraceUntil)) {
        throw { status: 403, message: 'Delivery indisponível no momento.' };
      }
    }

    if (data.type === 'MESA') {
      // Pedido de mesa lançado pela equipe pode ser identificado pelo NOME do
      // cliente em vez do número da mesa (cliente em pé no balcão, mesa
      // improvisada, etc.). Regra: número da mesa OU nome, pelo menos um; se
      // veio número, ele continua validado contra maxTables. O cardápio
      // público (clientOnline) segue exigindo o número -- pedido anônimo de
      // mesa sem mesa não tem como ser localizado pelo garçom.
      const hasTable = data.tableNumber !== null && data.tableNumber !== undefined;
      const hasName = typeof data.customerName === 'string' && data.customerName.trim().length > 0;
      if (hasTable) {
        if (data.tableNumber > config.maxTables || data.tableNumber < 1) {
          throw { status: 400, message: `Número da mesa inválido. O trailer tem ${config.maxTables} mesas.` };
        }
      } else if (clientOnline || !hasName) {
        throw {
          status: 400,
          message: clientOnline
            ? `Número da mesa inválido. O trailer tem ${config.maxTables} mesas.`
            : 'Informe o número da mesa ou o nome do cliente.'
        };
      }
    }

    let neighborhoodNameSnapshot = null;
    let deliveryFeeSnapshot = null;

    if (data.type === 'DELIVERY') {
      if (!data.customerAddress) {
        throw { status: 400, message: 'Endereço é obrigatório para delivery.' };
      }

      if (!clientOnline && data.customNeighborhoodName && data.customDeliveryFee) {
        // Bairro fora da lista, só pedido interno (equipe) -- sem busca em
        // Neighborhood, sem neighborhoodId. O cardápio público nunca cai aqui:
        // clientOnline é sempre true nesse caminho (fixado em public.controller.ts),
        // então mesmo que o payload traga esses campos, cai no branch de baixo.
        neighborhoodNameSnapshot = data.customNeighborhoodName;
        deliveryFeeSnapshot = new Prisma.Decimal(data.customDeliveryFee);
      } else {
        if (!data.neighborhoodId) {
          throw { status: 400, message: 'Taxa de entrega obrigatória para delivery.' };
        }
        const neighborhood = await prisma.neighborhood.findUnique({ where: { id: data.neighborhoodId } });
        if (!neighborhood || !neighborhood.active) {
          throw { status: 400, message: 'Bairro não atendido ou inativo.' };
        }
        neighborhoodNameSnapshot = neighborhood.name;
        deliveryFeeSnapshot = neighborhood.deliveryFee;
      }
    }

    const menuItemIds = data.items.map((i: any) => i.menuItemId);
    const extrasIds = data.items.flatMap((i: any) => i.extras.map((e: any) => e.menuItemId));
    const allIds = Array.from(new Set([...menuItemIds, ...extrasIds]));

    const menuItems = await prisma.menuItem.findMany({ where: { id: { in: allIds } } });
    const itemMap = new Map(menuItems.map(m => [m.id, m]));

    let subtotal = new Prisma.Decimal(0);
    const orderItemsData: any[] = [];

    for (const item of data.items) {
      const dbItem = itemMap.get(item.menuItemId);
      if (!dbItem) throw { status: 400, message: `Item não encontrado: ID ${item.menuItemId}` };
      if (dbItem.archived || !dbItem.available) {
        throw { status: 400, message: `O item '${dbItem.name}' está esgotado ou não faz mais parte do cardápio.` };
      }

      if (dbItem.requiredChoice) {
        const choice = dbItem.requiredChoice as any;
        if (!Array.isArray(choice?.options) || !item.selectedChoice || !choice.options.includes(item.selectedChoice)) {
          throw { status: 400, message: `O item '${dbItem.name}' exige uma escolha válida.` };
        }
      }

      let lineTotal = new Prisma.Decimal(dbItem.price);
      const extrasData: any[] = [];

      for (const extra of item.extras) {
        const dbExtra = itemMap.get(extra.menuItemId);
        if (!dbExtra) throw { status: 400, message: `Extra não encontrado: ID ${extra.menuItemId}` };
        if (dbExtra.archived || !dbExtra.available) {
          throw { status: 400, message: `O extra '${dbExtra.name}' está esgotado.` };
        }

        lineTotal = lineTotal.plus(new Prisma.Decimal(dbExtra.price).times(extra.quantity));

        extrasData.push({
          menuItemId: dbExtra.id,
          menuItemName: dbExtra.name,
          unitPrice: dbExtra.price,
          quantity: extra.quantity
        });
      }

      lineTotal = lineTotal.times(item.quantity);
      subtotal = subtotal.plus(lineTotal);

      orderItemsData.push({
        menuItemId: dbItem.id,
        menuItemName: dbItem.name,
        unitPrice: dbItem.price,
        quantity: item.quantity,
        observations: item.observations || null,
        selectedChoice: item.selectedChoice || null,
        extras: { create: extrasData }
      });
    }

    const total = subtotal.plus(deliveryFeeSnapshot || 0);

    if (data.paymentMethod === 'DINHEIRO') {
      if (!data.cashPaidAmount) throw { status: 400, message: 'Valor pago em dinheiro é obrigatório.' };
      const cashAmount = new Prisma.Decimal(data.cashPaidAmount);
      if (cashAmount.lessThan(total)) {
        throw { status: 400, message: 'Valor pago em dinheiro não pode ser menor que o total do pedido.' };
      }
    }

    const requiresStaffConfirmation = clientOnline && data.type === 'MESA';

    const orderData = {
      type: data.type,
      status: OrderStatus.AGUARDANDO,
      tableNumber: data.tableNumber ?? null,
      subtotal,
      total,
      paymentMethod: data.paymentMethod,
      cashPaidAmount: data.cashPaidAmount ? new Prisma.Decimal(data.cashPaidAmount) : null,
      customerName: data.customerName,
      customerPhone: data.customerPhone ? normalizePhone(data.customerPhone) : null,
      customerAddress: data.customerAddress,
      neighborhoodId: data.type === 'DELIVERY' ? data.neighborhoodId : null,
      neighborhoodNameSnapshot,
      deliveryFeeSnapshot,
      createdById: userId || null,
      createdByName: username || null,
      clientOnline,
      requiresStaffConfirmation,
      items: { create: orderItemsData },
      statusHistory: {
        create: {
          oldStatus: OrderStatus.AGUARDANDO,
          newStatus: OrderStatus.AGUARDANDO,
          changedBy: username || (clientOnline ? 'Cliente (Site)' : 'Sistema')
        }
      }
    };

    const newOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: orderData,
        include: ORDER_INCLUDE
      });

      await createLog(tx, {
        userId: userId || null,
        username: username || (clientOnline ? 'Cliente (Site)' : 'Sistema'),
        action: clientOnline ? 'ORDER_CREATED_PUBLIC' : 'ORDER_CREATED',
        details: { orderId: order.id, total: order.total.toString(), type: order.type }
      });

      return order;
    }, TX_TIMEOUT);

    getIO().of('/staff').emit('order:created', newOrder);
    return newOrder;
  },

  async updateOrderStatus(orderId: number, newStatus: OrderStatus, notes: string | undefined, user: any) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw { status: 404, message: 'Pedido não encontrado.' };

    if (order.requiresStaffConfirmation && order.status === 'AGUARDANDO' && newStatus !== 'AGUARDANDO' && newStatus !== 'CANCELADO') {
      throw { status: 403, message: 'O pedido de mesa feito online requer confirmação explícita antes de avançar.' };
    }

    const VALID_TRANSITIONS: Record<string, Record<string, string[]>> = {
      CHAPISTA: {
        AGUARDANDO: ['PREPARANDO', 'CANCELADO'],
        PREPARANDO: ['PRONTO', 'CANCELADO'],
        PRONTO: ['ENTREGUE', 'CANCELADO'],
      },
      ENTREGADOR: {
        EM_ROTA: ['ENTREGUE'],
      },
      GARCOM: {
        AGUARDANDO: ['CANCELADO'],
        PREPARANDO: ['CANCELADO'],
        PRONTO: ['ENTREGUE', 'CANCELADO'],
        EM_ROTA: ['CANCELADO'],
      },
    };

    if (VALID_TRANSITIONS[user.role]) {
      const allowedDestinations = VALID_TRANSITIONS[user.role][order.status] || [];
      if (!allowedDestinations.includes(newStatus)) {
         throw { status: 403, message: `Transição de ${order.status} para ${newStatus} inválida para o papel ${user.role}.` };
      }
    }

    if (newStatus === 'ENTREGUE' && order.type === 'DELIVERY' && !['ENTREGADOR', 'ADM', 'TI'].includes(user.role)) {
       throw { status: 403, message: 'Pedido de delivery só pode ser marcado como entregue pelo entregador responsável.' };
    }

    if (user.role === 'ENTREGADOR' && newStatus === 'ENTREGUE' && order.assignedToId !== user.userId) {
       throw { status: 403, message: 'Somente o entregador que assumiu a entrega pode finalizar.' };
    }

    if (newStatus === 'CANCELADO' && !notes) {
      throw { status: 400, message: 'O motivo do cancelamento é obrigatório.' };
    }

    const oldStatus = order.status;

    const updated = await prisma.$transaction(async (tx) => {
       const res = await tx.order.updateMany({
         where: { id: orderId, status: oldStatus },
         data: {
           status: newStatus,
           ...(newStatus === 'CANCELADO' ? { requiresStaffConfirmation: false } : {})
         }
       });

       if (res.count === 0) {
         throw { status: 409, message: 'O status do pedido mudou enquanto você editava. Recarregue e tente novamente.' };
       }

       const updatedOrder = await tx.order.findUnique({
         where: { id: orderId },
         include: ORDER_INCLUDE
       });

       await tx.orderStatusHistory.create({
         data: {
           orderId,
           oldStatus,
           newStatus,
           changedBy: user.username,
           notes
         }
       });

       await createLog(tx, {
         userId: user.userId,
         username: user.username,
         action: newStatus === 'CANCELADO' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
         details: { orderId, oldStatus, newStatus, notes }
       });

       return updatedOrder;
    }, TX_TIMEOUT);

    if (newStatus === 'CANCELADO') {
      getIO().of('/staff').emit('order:cancelled', { orderId, notes, changedBy: user.username });
    } else {
      getIO().of('/staff').emit('order:status_changed', { orderId, oldStatus, newStatus, changedBy: user.username, updatedOrder: updated });
    }

    return updated;
  },

  async confirmOrder(orderId: number, user: any) {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: { requiresStaffConfirmation: false },
        include: ORDER_INCLUDE
      });
      await createLog(tx, {
        userId: user.userId,
        username: user.username,
        action: 'ORDER_CONFIRMED_BY_STAFF',
        details: { orderId }
      });
      return order;
    }, TX_TIMEOUT);

    getIO().of('/staff').emit('order:confirmed', { orderId, updatedOrder: updated });
    return updated;
  },

  async acceptDelivery(orderId: number, user: any) {
    const r = await prisma.$transaction(async (tx) => {
       const res = await tx.order.updateMany({
         where: { id: orderId, type: 'DELIVERY', status: 'PRONTO', assignedToId: null },
         data: { status: 'EM_ROTA', assignedToId: user.userId, assignedToName: user.username }
       });

       if (res.count === 0) throw { status: 409, message: 'Pedido já foi aceito por outro entregador ou não está pronto.' };

       const order = await tx.order.findUnique({
         where: { id: orderId },
         include: ORDER_INCLUDE
       });
       if (!order) throw { status: 404, message: 'Pedido não encontrado.' };

       await tx.orderStatusHistory.create({
         data: {
           orderId,
           oldStatus: 'PRONTO',
           newStatus: 'EM_ROTA',
           changedBy: user.username
         }
       });

       await createLog(tx, {
         userId: user.userId,
         username: user.username,
         action: 'ORDER_ACCEPTED_BY_DRIVER',
         details: { orderId }
       });

       return order;
    }, TX_TIMEOUT);

    getIO().of('/staff').emit('order:accepted', { orderId, assignedToName: user.username, updatedOrder: r });
    return r;
  },

  async reportProblem(orderId: number, problem: string, user: any) {
     if (!problem || typeof problem !== 'string' || !problem.trim()) {
       throw { status: 400, message: 'Descreva o problema.' };
     }

     const updated = await prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
          where: { id: orderId },
          data: { problems: problem },
          include: ORDER_INCLUDE
        });
        await createLog(tx, {
          userId: user.userId,
          username: user.username,
          action: 'ORDER_PROBLEM_REPORTED',
          details: { orderId, problem }
        });
        return order;
     }, TX_TIMEOUT);

     getIO().of('/staff').emit('order:problem_reported', { orderId, problems: problem });
     return updated;
  },

  async getOrders(user: any, query: any) {
    const filter: any = {};

    if (user.role === 'CHAPISTA') {
      filter.status = { in: ['AGUARDANDO', 'PREPARANDO', 'PRONTO'] };
      filter.requiresStaffConfirmation = false;
    } else if (user.role === 'ENTREGADOR') {
      filter.type = 'DELIVERY';
      filter.OR = [
        { status: 'PRONTO', assignedToId: null },
        { status: 'EM_ROTA', assignedToId: user.userId }
      ];
    } else if (user.role === 'GARCOM') {
      if (query.pendingConfirmation === 'true') {
        filter.requiresStaffConfirmation = true;
      } else if (query.completed === 'true') {
        const shift = getShiftRange();
        filter.status = { in: ['ENTREGUE', 'CANCELADO'] };
        filter.createdAt = { gte: shift.from, lte: shift.to };
      } else {
        filter.status = { notIn: ['ENTREGUE', 'CANCELADO'] };
      }
    } else if (['ADM', 'TI'].includes(user.role)) {
       if (query.from && query.to) {
         filter.createdAt = { gte: parseLocalDayBoundary(query.from, false), lte: parseLocalDayBoundary(query.to, true) };
       } else {
         // Sem from/to: TI/ADM navegando um painel operacional (garçom, cozinha),
         // não pedindo relatório histórico. Cai no mesmo escopo do garçom em vez
         // de recusar com 400 -- o relatório com intervalo de data explícito
         // continua funcionando normalmente quando from/to são enviados (Fase 9).
         filter.status = { notIn: ['ENTREGUE', 'CANCELADO'] };
       }
    }

    // Paginação é opt-in via limit/offset -- sem eles, mantém o comportamento
    // de sempre (array puro), pra não quebrar os painéis operacionais (garçom,
    // cozinha, entregador) que chamam essa mesma rota sem esses parâmetros.
    // Usado hoje pela exportação "Completo" do relatório ADM/TI, que pagina
    // pedido a pedido em vez de baixar o período inteiro num request só.
    if (query.limit === undefined && query.offset === undefined) {
      return prisma.order.findMany({
        where: filter,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'asc' }
      });
    }

    const limit = Math.max(1, Math.min(500, parseInt(query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(query.offset, 10) || 0);

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where: filter,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset
      }),
      prisma.order.count({ where: filter })
    ]);

    return { data, meta: { limit, offset, total, hasMore: offset + data.length < total } };
  },

  // Usado pelo bot do WhatsApp (consultar_pedido_ativo) -- devolve TODOS os
  // pedidos em aberto do telefone, nunca só o mais recente. Um cliente pode
  // ter, por exemplo, um PRONTO feito pelo site mais cedo e outro AGUARDANDO
  // acabado de criar pelo bot; assumir "o mais recente" arrisca confundir o
  // cliente sobre qual pedido está em qual status.
  async findActiveOrdersByPhone(phone: string) {
    return prisma.order.findMany({
      where: {
        customerPhone: normalizePhone(phone),
        status: { in: ACTIVE_STATUSES }
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'asc' }
    });
  },

  // Usado pelo bot do WhatsApp (cancelar_pedido_ativo). Compare-and-set
  // atômico no mesmo padrão de acceptDelivery (5.4 do CONTEXTO): sem isso,
  // existe uma janela de corrida entre o cliente confirmar o cancelamento e
  // o CHAPISTA clicar "aceitar"/avançar o status no meio desse intervalo.
  // customerPhone entra no próprio where -- garante atomicamente que o
  // pedido é do telefone que está cancelando, não só que o ID existe.
  // Só AGUARDANDO é cancelável por aqui: a partir de PREPARANDO a comida já
  // está na chapa, reverter não é mais uma operação de sistema.
  async cancelActiveOrderByCustomer(orderId: number, phone: string, motivo: string) {
    const normalizedPhone = normalizePhone(phone);

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: orderId, customerPhone: normalizedPhone, status: 'AGUARDANDO' },
        data: { status: 'CANCELADO' }
      });

      if (res.count === 0) {
        // Não diferencia "não existe" de "não é seu telefone" de "já saiu de
        // AGUARDANDO" -- mesma mensagem pros três casos, igual ao padrão já
        // adotado pra divergência de bairro/endereço nesta mesma jornada.
        throw { status: 409, message: 'Não foi possível cancelar: o pedido já entrou em preparo (ou não foi encontrado em aberto pra este número).' };
      }

      const order = await tx.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!order) throw { status: 404, message: 'Pedido não encontrado.' };

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: 'AGUARDANDO',
          newStatus: 'CANCELADO',
          changedBy: 'Cliente via WhatsApp',
          notes: motivo
        }
      });

      await createLog(tx, {
        username: 'Cliente via WhatsApp',
        action: 'ORDER_CANCELLED',
        details: { orderId, notes: motivo }
      });

      return order;
    }, TX_TIMEOUT);

    getIO().of('/staff').emit('order:cancelled', { orderId, notes: motivo, changedBy: 'Cliente via WhatsApp' });
    return updated;
  }
};
