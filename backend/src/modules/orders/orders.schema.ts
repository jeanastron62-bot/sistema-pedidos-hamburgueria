import { z } from 'zod';
import { PaymentMethod, OrderType } from '@prisma/client';

const orderItemExtraSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
});

const orderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  observations: z.string().optional().nullable(),
  selectedChoice: z.string().optional().nullable(),
  extras: z.array(orderItemExtraSchema).default([]),
});

export const createOrderSchema = z.object({
  type: z.nativeEnum(OrderType),
  tableNumber: z.number().int().optional().nullable(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  cashPaidAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  neighborhoodId: z.number().int().optional().nullable(),
  // Fase 12 -- bairro fora da lista, só para pedido criado pela equipe
  // (clientOnline: false). O cardápio público nunca envia esses campos; se
  // enviar, orders.service.ts ignora por causa do próprio clientOnline.
  customNeighborhoodName: z.string().min(1).optional().nullable(),
  customDeliveryFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  items: z.array(orderItemSchema).min(1, "O pedido precisa ter pelo menos um item"),
}).refine(data => {
  if (data.type === 'RETIRADA' || data.type === 'DELIVERY') {
    return !!data.customerName && !!data.customerPhone;
  }
  return true;
}, {
  message: "Nome e telefone são obrigatórios para pedidos de Retirada ou Delivery",
  path: ["customerPhone"]
});
