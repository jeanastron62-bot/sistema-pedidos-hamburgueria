import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { formatMoney } from '../../utils/money';
import type { ReportsSummary } from '../../types';

interface KpiCardsProps {
  from: Date;
  to: Date;
}

function Card({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-neutral-950 border border-neutral-850 p-4">
      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-black font-display ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

export function KpiCards({ from, to }: KpiCardsProps) {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // granularity é obrigatório pelo endpoint, mas KpiCards só usa os 4
    // agregados -- 'day' é o valor mais barato que ainda satisfaz o contrato,
    // a série retornada junto é descartada.
    api.get<ReportsSummary>('/reports/summary', {
      params: { from: from.toISOString(), to: to.toISOString(), granularity: 'day' },
    })
      .then(({ data }) => { if (!cancelled) setSummary(data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Erro ao carregar KPIs.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  if (loading) return <p className="text-neutral-500">Carregando...</p>;
  if (error) return <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>;
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label="Faturamento Bruto" value={formatMoney(summary.faturamentoCents)} />
      <Card label="Pedidos Entregues" value={String(summary.deliveredCount)} />
      <Card label="Ticket Médio" value={formatMoney(summary.ticketMedioCents)} />
      <Card label="Cancelamentos" value={String(summary.cancelledCount)} danger />
    </div>
  );
}
