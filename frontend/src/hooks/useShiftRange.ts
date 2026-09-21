import { useEffect, useState } from 'react';
import { api } from '../services/api';

// Busca a janela de expediente no backend em vez de calcular no relógio do
// navegador -- garante que o KPI "Hoje" do ADM/TI usa exatamente o mesmo
// corte que o backend usa pra filtrar de verdade (GET /orders?from=&to=).
export function useShiftRange() {
  const [range, setRange] = useState<{ from: Date; to: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<{ from: string; to: string }>('/config/shift-range')
      .then(({ data }) => { if (!cancelled) setRange({ from: new Date(data.from), to: new Date(data.to) }); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Erro ao carregar período.'); });
    return () => { cancelled = true; };
  }, []);

  return { range, error };
}
