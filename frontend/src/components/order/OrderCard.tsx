import { getOrderLabel } from '../../utils/orderLabel';
import { formatMoneyFromString } from '../../utils/money';
import type { Order, OrderStatus } from '../../types';

const STATUS_COLORS: Record<OrderStatus, string> = { AGUARDANDO: 'bg-yellow-600', PREPARANDO: 'bg-blue-600', PRONTO: 'bg-green-600', EM_ROTA: 'bg-purple-600', ENTREGUE: 'bg-white/20', CANCELADO: 'bg-red-800' };
const STATUS_LABELS: Record<OrderStatus, string> = { AGUARDANDO: 'Aguardando', PREPARANDO: 'Preparando', PRONTO: 'Pronto', EM_ROTA: 'Em Rota', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado' };

interface OrderCardProps {
  order: Order;
  onCancelClick: (order: Order) => void;
  onMarkDelivered?: (order: Order) => void;
}

export function OrderCard({ order, onCancelClick, onMarkDelivered }: OrderCardProps) {
  const canCancel = order.status !== 'ENTREGUE' && order.status !== 'CANCELADO';
  const canMarkDelivered = order.status === 'PRONTO' && order.type !== 'DELIVERY' && !!onMarkDelivered;

  return (
    <div className="rounded-2xl bg-neutral-900/50 border border-neutral-850 border-t-2 border-t-primary/50 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono text-neutral-600">Nº {String(order.id).padStart(4, '0')}</p>
          <p className="font-black text-white font-display text-lg">{getOrderLabel(order)}</p>
          <p className="text-[10px] font-mono uppercase text-neutral-500">{order.type}</p>
          {order.requiresStaffConfirmation && (<span className="mt-1 inline-block rounded bg-secondary px-2 py-0.5 text-xs font-bold text-black">Site — aguarda confirmação</span>)}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-wider font-semibold text-white ${STATUS_COLORS[order.status]}`}>{STATUS_LABELS[order.status]}</span>
      </div>

      <div className="my-3 border-t border-dashed border-neutral-800" />

      <div className="text-sm text-neutral-300">
        {order.items.map((item) => (<p key={item.id}>{item.quantity}x {item.menuItemName}{item.selectedChoice ? ` (${item.selectedChoice})` : ''}</p>))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="font-semibold text-secondary">{formatMoneyFromString(order.total)}</span>
        <div className="flex items-center gap-3">
          {canMarkDelivered && (<button onClick={() => onMarkDelivered?.(order)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Entregue ✓</button>)}
          {canCancel && (<button onClick={() => onCancelClick(order)} className="text-xs text-red-400">Cancelar</button>)}
        </div>
      </div>
    </div>
  );
}
