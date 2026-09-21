import type { Order } from '../types';

export function getOrderLabel(order: Pick<Order, 'id' | 'type' | 'tableNumber' | 'customerName'>): string {
  if (order.type === 'MESA') {
    // Mesa pode ser identificada pelo número, pelo nome do cliente, ou os
    // dois (pedido interno). Sem nenhum dos dois só acontece em dado antigo.
    const name = order.customerName?.trim();
    if (order.tableNumber !== null && order.tableNumber !== undefined) {
      return name ? `Mesa ${order.tableNumber} · ${name}` : `Mesa ${order.tableNumber}`;
    }
    return name ? `Mesa: ${name}` : 'Mesa ?';
  }
  const name = order.customerName || 'Sem Nome';
  if (order.type === 'DELIVERY') return `Delivery: ${name}`;
  if (order.type === 'RETIRADA') return `Retirada: ${name}`;
  return `Pedido #${order.id}`;
}
