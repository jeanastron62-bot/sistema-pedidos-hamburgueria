import { useState } from 'react';
import { Copy, Phone, AlertTriangle } from 'lucide-react';
import { formatMoneyFromString, toCents, formatMoney } from '../../utils/money';
import type { Order } from '../../types';

interface DeliveryOrderCardProps {
  order: Order;
  isMine: boolean;
  onAccept: () => void;
  onComplete: () => void;
  onReportProblem: () => void;
  actionDisabled?: boolean;
}

export function DeliveryOrderCard({ order, isMine, onAccept, onComplete, onReportProblem, actionDisabled }: DeliveryOrderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const changeToGiveCents = order.paymentMethod === 'DINHEIRO' && order.cashPaidAmount ? toCents(order.cashPaidAmount) - toCents(order.total) : null;

  return (
    <div className="rounded-2xl bg-neutral-900/50 border border-neutral-850 border-t-2 border-t-delivery/50 overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between p-4 text-left">
        <div>
          <p className="text-[10px] font-mono text-neutral-600">Nº {String(order.id).padStart(4, '0')}</p>
          <p className="font-black text-white font-display">{order.customerName}</p>
          <p className="text-xs font-mono uppercase text-neutral-500">{formatMoneyFromString(order.total)}</p>
        </div>
        <span className="text-xs font-mono uppercase text-delivery">{expanded ? 'Fechar' : 'Ver'}</span>
      </button>

      {expanded && (
        <div className="border-t border-dashed border-neutral-800 p-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase text-neutral-500">Endereço</p>
            <p className="text-sm text-white">{order.customerAddress}</p>
            <p className="text-xs text-neutral-400">{order.neighborhoodNameSnapshot}</p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => navigator.clipboard.writeText(order.customerAddress || '')} className="flex-1 h-14 rounded-xl bg-neutral-850 border border-neutral-750 flex items-center justify-center gap-2 text-sm font-bold text-white"><Copy size={18} />Copiar Endereço</button>
            <a href={`tel:${order.customerPhone}`} className="flex-1 h-14 rounded-xl bg-neutral-850 border border-neutral-750 flex items-center justify-center gap-2 text-sm font-bold text-white"><Phone size={18} />Ligar</a>
          </div>

          {changeToGiveCents !== null && (<div className="rounded-xl bg-secondary/10 border border-secondary/30 p-3"><p className="text-[10px] font-mono uppercase text-secondary">Troco a levar</p><p className="text-xl font-black text-white">{formatMoney(changeToGiveCents)}</p></div>)}

          {order.problems && (<div className="rounded-xl bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{order.problems}</div>)}

          <div className="flex gap-2">
            {!isMine && (<button onClick={onAccept} disabled={actionDisabled} className="flex-1 h-14 rounded-xl bg-delivery hover:bg-delivery-hover text-white font-bold text-sm disabled:opacity-50">{actionDisabled ? 'Aguarde...' : '🏍️ Saí para Entrega'}</button>)}
            {isMine && (<><button onClick={onReportProblem} disabled={actionDisabled} className="h-14 px-4 rounded-xl bg-neutral-850 border border-neutral-750 text-neutral-300 text-sm font-bold disabled:opacity-50">Reportar Problema</button><button onClick={onComplete} disabled={actionDisabled} className="flex-1 h-14 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50">{actionDisabled ? 'Aguarde...' : '🗺️ Entrega Concluída ✓'}</button></>)}
          </div>
        </div>
      )}
    </div>
  );
}
