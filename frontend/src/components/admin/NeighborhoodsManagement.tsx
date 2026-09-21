import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Neighborhood } from '../../types';

export function NeighborhoodsManagement() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [newName, setNewName] = useState('');
  const [newFee, setNewFee] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Neighborhood[]>('/neighborhoods');
      setNeighborhoods(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar bairros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const patchLocal = (id: number, patch: Partial<Neighborhood>) => {
    setNeighborhoods((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const handleSave = async (n: Neighborhood) => {
    setSavingId(n.id);
    setError(null);
    try {
      await api.patch(`/neighborhoods/${n.id}`, { name: n.name, deliveryFee: n.deliveryFee, active: n.active });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar bairro.');
    } finally {
      setSavingId(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newFee.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { data } = await api.post<Neighborhood>('/neighborhoods', { name: newName.trim(), deliveryFee: newFee.trim() });
      setNeighborhoods((prev) => [...prev, data]);
      setNewName('');
      setNewFee('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar bairro.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="text-neutral-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="text-lg font-black text-white font-display">Bairros</h3>
        <p className="text-xs font-mono text-neutral-500">Nome, taxa de entrega e disponibilidade</p>
      </div>

      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-neutral-900 border border-neutral-850 p-3">
        <Input label="Novo bairro" value={newName} onChange={(e) => setNewName(e.target.value)} className="min-w-[200px]" />
        <Input label="Taxa (R$)" value={newFee} onChange={(e) => setNewFee(e.target.value)} placeholder="8.00" className="w-32" />
        <Button onClick={handleCreate} disabled={creating || !newName.trim() || !newFee.trim()}>
          <Plus size={18} className="inline -mt-0.5 mr-1" /> Adicionar
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {neighborhoods.map((n) => (
          <div key={n.id} className="flex flex-wrap items-end gap-2 rounded-2xl bg-neutral-900 border border-neutral-850 p-3">
            <Input label="Nome" value={n.name} onChange={(e) => patchLocal(n.id, { name: e.target.value })} className="min-w-[200px]" />
            <Input label="Taxa (R$)" value={n.deliveryFee} onChange={(e) => patchLocal(n.id, { deliveryFee: e.target.value })} className="w-32" />
            <label className="flex h-12 items-center gap-2 px-2">
              <input type="checkbox" checked={n.active} onChange={(e) => patchLocal(n.id, { active: e.target.checked })} className="h-5 w-5" />
              <span className="text-sm text-neutral-400">Ativo</span>
            </label>
            <Button variant="secondary" onClick={() => handleSave(n)} disabled={savingId === n.id}>
              {savingId === n.id ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        ))}
        {neighborhoods.length === 0 && <p className="py-10 text-center text-sm text-neutral-500">Nenhum bairro cadastrado.</p>}
      </div>
    </div>
  );
}
