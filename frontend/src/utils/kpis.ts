import { toCents } from './money';
import type { Order } from '../types';

export interface Kpis {
  faturamentoCents: number;
  deliveredCount: number;
  ticketMedioCents: number;
  cancelledCount: number;
  delivered: Order[];
}

// Fonte unica dos 4 KPIs do dashboard ADM/TI -- consumida tanto pelo KpiCards
// (tela) quanto pelo relatorio PDF, pra tela e PDF nunca divergirem.
// So agrega o que o servidor ja validou (status/total), nao recalcula preco.
export function computeKpis(orders: Order[]): Kpis {
  const delivered = orders.filter((o) => o.status === 'ENTREGUE');
  const cancelled = orders.filter((o) => o.status === 'CANCELADO');
  const faturamentoCents = delivered.reduce((sum, o) => sum + toCents(o.total), 0);
  const ticketMedioCents = delivered.length > 0 ? Math.round(faturamentoCents / delivered.length) : 0;
  return {
    faturamentoCents,
    deliveredCount: delivered.length,
    ticketMedioCents,
    cancelledCount: cancelled.length,
    delivered,
  };
}
