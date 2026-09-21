import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../services/api';
import { formatMoney } from '../../utils/money';
import { getGranularityForPeriod, type PeriodKey, type Granularity } from '../../utils/periods';
import type { ReportsSummary, ReportsSeriesPoint } from '../../types';

interface RevenueChartProps {
  from: Date;
  to: Date;
  period: PeriodKey | 'personalizado';
}

// 'personalizado' não tem granularidade fixa como os outros períodos --
// usa 'day' como padrão razoável pra qualquer intervalo escolhido à mão.
function granularityForChart(period: PeriodKey | 'personalizado'): Granularity {
  return period === 'personalizado' ? 'day' : getGranularityForPeriod(period);
}

interface ChartPoint extends ReportsSeriesPoint {
  label: string;
}

// Rótulo do eixo X sempre em horário de Brasília, independente do fuso do
// sistema operacional de quem está olhando o painel.
function formatBucketLabel(bucket: string, granularity: Granularity): string {
  const date = new Date(bucket);
  if (granularity === 'hour') {
    return `${date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })}h`;
  }
  if (granularity === 'day') {
    return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: '2-digit', year: 'numeric' });
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-neutral-850 bg-neutral-950 p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-white">{point.label} — {formatMoney(point.faturamentoCents)}</p>
      <p className="text-neutral-400">Entregues: {point.deliveredCount} · Cancelados: {point.cancelledCount}</p>
    </div>
  );
}

export function RevenueChart({ from, to, period }: RevenueChartProps) {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const granularity = granularityForChart(period);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<ReportsSummary>('/reports/summary', {
      params: { from: from.toISOString(), to: to.toISOString(), granularity },
    })
      .then(({ data }) => { if (!cancelled) setSummary(data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Erro ao carregar série.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, granularity]);

  if (loading) return <p className="text-neutral-500">Carregando...</p>;
  if (error) return <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>;
  if (!summary) return null;

  const chartData: ChartPoint[] = summary.series.map((point) => ({
    ...point,
    label: formatBucketLabel(point.bucket, granularity),
  }));

  return (
    <div className="rounded-2xl bg-neutral-950 border border-neutral-850 p-4">
      <p className="mb-3 text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500">Faturamento por período</p>
      {chartData.length === 0 ? (
        <p className="text-neutral-500">Nenhum pedido no período.</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" />
              <XAxis dataKey="label" stroke="#ffffff80" fontSize={12} />
              <YAxis stroke="#ffffff80" fontSize={12} tickFormatter={(v) => formatMoney(v)} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="faturamentoCents" stroke="#f97316" fill="#f9731633" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
