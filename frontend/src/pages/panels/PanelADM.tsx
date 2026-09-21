import { useEffect, useState } from 'react';
import { PanelLayout } from '../../components/layout/PanelLayout';
import { TrailerBanner } from '../../components/layout/TrailerBanner';
import { Tabs } from '../../components/ui/Tabs';
import { KpiCards } from '../../components/admin/KpiCards';
import { RevenueChart } from '../../components/admin/RevenueChart';
import { PeriodSelector } from '../../components/admin/PeriodSelector';
import { MenuManagement } from '../../components/admin/MenuManagement';
import { UsersManagement } from '../../components/admin/UsersManagement';
import { NeighborhoodsManagement } from '../../components/admin/NeighborhoodsManagement';
import { SettingsPanel } from '../../components/admin/SettingsPanel';
import { ExportReportButton } from '../../components/admin/ExportReportButton';
import { WhatsappConnection } from '../../components/admin/WhatsappConnection';
import { WhatsappInbox } from '../../components/whatsapp/WhatsappInbox';
import { usePeriodSelection } from '../../hooks/usePeriodSelection';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useSocketStore } from '../../stores/useSocketStore';
import { useWhatsappInboxStore } from '../../stores/useWhatsappInboxStore';

export default function PanelADM() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const {
    period, setPeriod,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    applyCustomRange,
    range, periodLabel, rangeError,
  } = usePeriodSelection();
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const connectStaff = useSocketStore((s) => s.connectStaff);
  const fetchPendingCount = useWhatsappInboxStore((s) => s.fetchPendingCount);
  const pausedCount = useWhatsappInboxStore((s) => s.pendingCount);

  useEffect(() => { fetchCatalog(); connectStaff(); fetchPendingCount(); }, [fetchCatalog, connectStaff, fetchPendingCount]);

  const TABS = [
    { key: 'DASHBOARD', label: 'Dashboard' },
    { key: 'CARDAPIO', label: 'Cardápio' },
    { key: 'USUARIOS', label: 'Usuários' },
    { key: 'BAIRROS', label: 'Bairros' },
    { key: 'CONFIG', label: 'Configurações' },
    { key: 'WHATSAPP', label: 'WhatsApp' },
    { key: 'ATENDIMENTO', label: pausedCount > 0 ? `Atendimento (${pausedCount})` : 'Atendimento' },
  ];

  return (
    <PanelLayout title="Painel Admin">
      <div className="mb-4">
        <Tabs items={TABS} active={activeTab} onChange={setActiveTab} />
      </div>
      <div className="mb-4"><TrailerBanner /></div>

      {activeTab === 'DASHBOARD' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <PeriodSelector
              period={period}
              onPeriodChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              onApplyCustom={applyCustomRange}
            />
            {range && (
              <div className="flex flex-wrap gap-2">
                <ExportReportButton range={range} periodLabel={periodLabel} format="pdf" />
                <ExportReportButton range={range} periodLabel={periodLabel} format="xlsx" />
              </div>
            )}
          </div>
          {rangeError && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{rangeError}</p>}
          {range && (
            <>
              <KpiCards from={range.from} to={range.to} />
              <RevenueChart from={range.from} to={range.to} period={period} />
            </>
          )}
          {!range && !rangeError && <p className="text-neutral-500">Carregando período...</p>}
        </div>
      )}
      {activeTab === 'CARDAPIO' && <MenuManagement />}
      {activeTab === 'USUARIOS' && <UsersManagement />}
      {activeTab === 'BAIRROS' && <NeighborhoodsManagement />}
      {activeTab === 'CONFIG' && <SettingsPanel />}
      {activeTab === 'WHATSAPP' && <WhatsappConnection />}
      {activeTab === 'ATENDIMENTO' && <WhatsappInbox />}
    </PanelLayout>
  );
}
