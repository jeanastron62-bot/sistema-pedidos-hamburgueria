import { useEffect, useState } from 'react';
import { PanelLayout } from '../../components/layout/PanelLayout';
import { DeliveryOrderCard } from '../../components/order/DeliveryOrderCard';
import { ReportProblemModal } from '../../components/order/ReportProblemModal';
import { useOrdersStore } from '../../stores/useOrdersStore';
import { useSocketStore } from '../../stores/useSocketStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { api } from '../../services/api';
import type { Order } from '../../types';

export default function PanelEntregador() {
  const orders = useOrdersStore((s) => s.orders);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const ordersError = useOrdersStore((s) => s.error);
  const connectStaff = useSocketStore((s) => s.connectStaff);
  const user = useAuthStore((s) => s.user);

  const [problemTarget, setProblemTarget] = useState<Order | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  useEffect(() => { fetchOrders(); connectStaff(); }, [fetchOrders, connectStaff]);

  const available = orders.filter((o) => o.type === 'DELIVERY' && o.status === 'PRONTO' && !o.assignedToId);
  const mine = orders.filter((o) => o.type === 'DELIVERY' && o.status === 'EM_ROTA' && o.assignedToId === user?.id);

  const handleAccept = async (order: Order) => {
    if (pendingIds.has(order.id)) return;
    setPendingIds((prev) => new Set(prev).add(order.id));
    setAcceptError(null);
    try {
      await api.patch(`/orders/${order.id}/accept`);
    } catch (err: any) {
      setAcceptError(err.response?.status === 409 ? `${order.customerName}: já foi aceito por outro entregador.` : 'Erro ao aceitar entrega.');
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(order.id); return next; });
    }
  };

  const handleComplete = async (order: Order) => {
    if (pendingIds.has(order.id)) return;
    setPendingIds((prev) => new Set(prev).add(order.id));
    setAcceptError(null);
    try {
      await api.patch(`/orders/${order.id}/status`, { newStatus: 'ENTREGUE' });
    } catch (err: any) {
      setAcceptError(err.response?.data?.error || 'Erro ao concluir entrega.');
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(order.id); return next; });
    }
  };

  const handleSubmitProblem = async (problem: string) => {
    if (!problemTarget) return;
    await api.patch(`/orders/${problemTarget.id}/problem`, { problem });
  };

  return (
    <PanelLayout title="Painel do Entregador">
      {ordersError && (<div className="mb-4 rounded-xl bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{ordersError}</div>)}
      {acceptError && (<div className="mb-4 rounded-xl bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{acceptError}</div>)}

      {mine.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 font-mono text-xs font-black uppercase tracking-widest text-neutral-500">Minhas Entregas ({mine.length})</h2>
          <div className="flex flex-col gap-3">
            {mine.map((order) => (<DeliveryOrderCard key={order.id} order={order} isMine onAccept={() => {}} onComplete={() => handleComplete(order)} onReportProblem={() => setProblemTarget(order)} actionDisabled={pendingIds.has(order.id)} />))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-mono text-xs font-black uppercase tracking-widest text-neutral-500">Disponíveis ({available.length})</h2>
        <div className="flex flex-col gap-3">
          {available.map((order) => (<DeliveryOrderCard key={order.id} order={order} isMine={false} onAccept={() => handleAccept(order)} onComplete={() => {}} onReportProblem={() => {}} actionDisabled={pendingIds.has(order.id)} />))}
          {available.length === 0 && <p className="py-10 text-center text-sm text-neutral-500">Nenhuma entrega disponível no momento.</p>}
        </div>
      </div>

      <ReportProblemModal open={!!problemTarget} onClose={() => setProblemTarget(null)} onSubmit={handleSubmitProblem} />
    </PanelLayout>
  );
}
