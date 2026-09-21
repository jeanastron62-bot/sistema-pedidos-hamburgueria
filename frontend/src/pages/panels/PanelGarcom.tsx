import { useEffect, useState } from 'react';
import { PanelLayout } from '../../components/layout/PanelLayout';
import { TrailerBanner } from '../../components/layout/TrailerBanner';
import { OrderCard } from '../../components/order/OrderCard';
import { OrderWizard } from '../../components/order/OrderWizard';
import { CancelOrderModal } from '../../components/order/CancelOrderModal';
import { WhatsappInbox } from '../../components/whatsapp/WhatsappInbox';
import { useOrdersStore } from '../../stores/useOrdersStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useSocketStore } from '../../stores/useSocketStore';
import { useWhatsappInboxStore } from '../../stores/useWhatsappInboxStore';
import { api } from '../../services/api';
import type { Order, OrderStatus } from '../../types';

type TabKey = 'TODOS' | 'SITE' | 'AGUARDANDO' | 'PREPARANDO' | 'PRONTO' | 'ENTREGUE' | 'CANCELADO' | 'ATENDIMENTO';

export default function PanelGarcom() {
  const orders = useOrdersStore((s) => s.orders);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const connectStaff = useSocketStore((s) => s.connectStaff);
  const fetchPendingCount = useWhatsappInboxStore((s) => s.fetchPendingCount);
  const pausedCount = useWhatsappInboxStore((s) => s.pendingCount);

  const [activeTab, setActiveTab] = useState<TabKey>('TODOS');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchOrders(); fetchCatalog(); connectStaff(); fetchPendingCount(); }, [fetchOrders, fetchCatalog, connectStaff, fetchPendingCount]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'TODOS', label: 'Todos' },
    { key: 'SITE', label: 'Pedidos do Site (!)' },
    { key: 'AGUARDANDO', label: 'Aguardando' },
    { key: 'PREPARANDO', label: 'Preparando' },
    { key: 'PRONTO', label: 'Pronto' },
    { key: 'ENTREGUE', label: 'Entregue' },
    { key: 'CANCELADO', label: 'Cancelado' },
    { key: 'ATENDIMENTO', label: pausedCount > 0 ? `Atendimento (${pausedCount})` : 'Atendimento' },
  ];

  const filtered = activeTab === 'ATENDIMENTO' ? [] : orders.filter((o) => {
    if (activeTab === 'TODOS') return o.status !== 'ENTREGUE' && o.status !== 'CANCELADO';
    if (activeTab === 'SITE') return o.requiresStaffConfirmation;
    return o.status === (activeTab as OrderStatus);
  });

  const handleConfirmCancel = async (notes: string) => {
    if (!cancelTarget) return;
    await api.patch(`/orders/${cancelTarget.id}/status`, { newStatus: 'CANCELADO', notes });
  };

  const handleConfirmSiteOrder = async (order: Order) => {
    try {
      await api.patch(`/orders/${order.id}/confirm`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao confirmar o pedido.');
    }
  };

  const handleMarkDelivered = async (order: Order) => {
    try {
      await api.patch(`/orders/${order.id}/status`, { newStatus: 'ENTREGUE' });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao marcar como entregue.');
    }
  };

  return (
    <PanelLayout title="Painel do Garçom">
      <div className="mb-4"><TrailerBanner /></div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => (<button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`h-11 shrink-0 rounded-xl px-4 text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-primary text-white' : 'bg-neutral-850 text-neutral-400 hover:text-white hover:bg-neutral-800'}`}>{tab.label}</button>))}
      </div>

      {error && (<div className="mb-4 rounded-xl bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</div>)}

      {activeTab === 'ATENDIMENTO' ? (
        <WhatsappInbox />
      ) : (
        <>
          <button onClick={() => setWizardOpen(true)} className="mb-4 flex h-[72px] w-full items-center justify-center rounded-xl bg-primary text-lg font-bold text-white hover:bg-primary-hover">➕ Novo Pedido</button>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((order) => (
              <div key={order.id}>
                <OrderCard order={order} onCancelClick={setCancelTarget} onMarkDelivered={handleMarkDelivered} />
                {order.requiresStaffConfirmation && (<button onClick={() => handleConfirmSiteOrder(order)} className="mt-1 h-10 w-full rounded-lg bg-secondary text-sm font-semibold text-black">Confirmar</button>)}
              </div>
            ))}
            {filtered.length === 0 && (<p className="col-span-full py-10 text-center text-sm text-neutral-500">Nenhum pedido nesta aba.</p>)}
          </div>
        </>
      )}

      <OrderWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <CancelOrderModal open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleConfirmCancel} />
    </PanelLayout>
  );
}
