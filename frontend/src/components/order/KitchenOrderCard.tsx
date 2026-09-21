import { OrderTimer } from './OrderTimer';
import { getOrderLabel } from '../../utils/orderLabel';
import type { Order } from '../../types';

interface KitchenOrderCardProps {
  order: Order;
  actionLabel: string;
  onAction: () => void;
  onCancelClick: () => void;
  actionDisabled?: boolean;
}

export function KitchenOrderCard({ order, actionLabel, onAction, onCancelClick, actionDisabled }: KitchenOrderCardProps) {
  return (
    <div className="rounded-2xl bg-neutral-900/50 border border-neutral-850 border-t-2 border-t-primary/50 p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[10px] font-mono text-neutral-600">Nº {String(order.id).padStart(4, '0')}</p>
          <p className="font-black text-white font-display text-lg">{getOrderLabel(order)}</p>
          <p className="text-[10px] font-mono uppercase text-neutral-500">{order.type}</p>
        </div>
        <OrderTimer createdAt={order.createdAt} />
      </div>

      <div className="border-t border-dashed border-neutral-800 mb-3" />

      <div className="flex flex-col gap-2 mb-3">
        {order.items.map((item) => (
          <div key={item.id} className="text-sm">
            <p className="font-bold text-white">{item.quantity}x {item.menuItemName}</p>
            {item.selectedChoice && (<p className="text-primary font-mono text-xs font-bold uppercase ml-2">→ {item.selectedChoice}</p>)}
            {item.extras.length > 0 && (<p className="text-secondary font-mono text-xs font-bold ml-2">+ {item.extras.map((ex) => `${ex.quantity}x ${ex.menuItemName}`).join(', ')}</p>)}
            {item.observations && (<div className="mt-1 ml-2 rounded-lg bg-red-950/40 border border-red-900/60 px-2 py-1 text-xs text-red-300">⚠️ {item.observations}</div>)}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={onCancelClick} disabled={actionDisabled} className="h-14 px-3 rounded-xl bg-neutral-850 border border-neutral-750 text-neutral-400 text-xs font-mono uppercase disabled:opacity-50">Cancelar</button>
        <button onClick={onAction} disabled={actionDisabled} className="flex-1 h-14 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm disabled:opacity-50">{actionDisabled ? 'Aguarde...' : actionLabel}</button>
      </div>
    </div>
  );
}
