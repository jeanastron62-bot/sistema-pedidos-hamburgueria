import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import type { Log } from '../../types';

interface LogsResponse {
  data: Log[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function LogsViewer() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [username, setUsername] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (action.trim()) params.action = action.trim();
      if (username.trim()) params.username = username.trim();
      if (from && to) { params.from = from; params.to = to; }
      const { data } = await api.get<LogsResponse>('/logs', { params });
      setLogs(data.data);
      setMeta(data.meta);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  };

  // Só refaz a busca em troca de página; filtros de texto só aplicam no clique
  // de "Filtrar" (handleFilter chama load() direto), não a cada tecla digitada.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page]);

  const handleFilter = () => {
    setPage(1);
    load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-neutral-900 border border-neutral-850 p-3">
        <Input label="Ação" value={action} onChange={(e) => setAction(e.target.value)} placeholder="ORDER_CANCELLED" className="w-48" />
        <Input label="Usuário" value={username} onChange={(e) => setUsername(e.target.value)} className="w-40" />
        <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        <Button variant="secondary" onClick={handleFilter}>Filtrar</Button>
      </div>

      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-850">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-850 bg-neutral-900/60 text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">
              <th className="p-3">Data</th>
              <th className="p-3">Usuário</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-3 text-neutral-500">Carregando...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="p-3 text-neutral-500">Nenhum log encontrado.</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-neutral-850/60 text-neutral-300 hover:bg-neutral-900/40 transition-colors">
                  <td className="p-3 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="p-3">{log.username}{log.user ? ` (${log.user.role})` : ''}</td>
                  <td className="p-3 font-mono text-xs">{log.action}</td>
                  <td className="max-w-xs truncate p-3 font-mono text-xs" title={log.details ? JSON.stringify(log.details) : ''}>
                    {log.details ? JSON.stringify(log.details) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>Página {meta.page} de {meta.totalPages} ({meta.total} registros)</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="md" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={18} /></Button>
          <Button variant="ghost" size="md" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={18} /></Button>
        </div>
      </div>
    </div>
  );
}
