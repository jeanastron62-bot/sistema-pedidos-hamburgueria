import { useEffect, useState } from 'react';
import { Plus, X, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import type { Category, MenuItem, RequiredChoice } from '../../types';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'HOT_DOGS', label: 'Hot Dogs' },
  { value: 'HAMBURGUERES', label: 'Hambúrgueres' },
  { value: 'MACARRAO_NA_CHAPA', label: 'Macarrão na Chapa' },
  { value: 'BEBIDAS', label: 'Bebidas' },
  { value: 'ACRESCIMOS', label: 'Acréscimos' },
];

interface FormState {
  name: string;
  category: Category;
  price: string;
  description: string;
  ingredients: string[];
  requiredChoice: RequiredChoice | null;
}

const emptyForm: FormState = {
  name: '',
  category: 'HOT_DOGS',
  price: '',
  description: '',
  ingredients: [],
  requiredChoice: null,
};

function ItemForm({ initial, onSave, onCancel, saving }: {
  initial: FormState;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [ingredientInput, setIngredientInput] = useState('');
  const [optionInput, setOptionInput] = useState('');

  const addIngredient = () => {
    if (!ingredientInput.trim()) return;
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, ingredientInput.trim()] }));
    setIngredientInput('');
  };
  const removeIngredient = (idx: number) => {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  };

  const addOption = () => {
    if (!optionInput.trim() || !form.requiredChoice) return;
    setForm((f) => ({ ...f, requiredChoice: { ...f.requiredChoice!, options: [...f.requiredChoice!.options, optionInput.trim()] } }));
    setOptionInput('');
  };
  const removeOption = (idx: number) => {
    setForm((f) => ({ ...f, requiredChoice: f.requiredChoice ? { ...f.requiredChoice, options: f.requiredChoice.options.filter((_, i) => i !== idx) } : null }));
  };

  const canSave = form.name.trim() && /^\d+(\.\d{1,2})?$/.test(form.price.trim()) && (!form.requiredChoice || (form.requiredChoice.label.trim() && form.requiredChoice.options.length > 0));

  return (
    <div className="flex flex-col gap-3">
      <Input label="Nome" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      <Select label="Categoria" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}>
        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
      <Input label="Preço (R$)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="12.00" />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">Descrição</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="h-20 w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">Ingredientes</label>
        <div className="flex flex-wrap gap-2">
          {form.ingredients.map((ing, idx) => (
            <span key={idx} className="flex items-center gap-1 rounded-full bg-neutral-850 px-3 py-1 text-sm text-white">
              {ing}
              <button type="button" onClick={() => removeIngredient(idx)}><X size={14} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={ingredientInput}
            onChange={(e) => setIngredientInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(); } }}
            placeholder="Ex: Queijo cheddar"
            className="h-11 flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none"
          />
          <Button type="button" variant="secondary" onClick={addIngredient}>Adicionar</Button>
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.requiredChoice !== null}
          onChange={(e) => setForm((f) => ({ ...f, requiredChoice: e.target.checked ? { label: '', options: [] } : null }))}
          className="h-5 w-5"
        />
        <span className="text-sm text-white">Este item exige uma escolha (ex: sabor)?</span>
      </label>

      {form.requiredChoice && (
        <div className="flex flex-col gap-2 rounded-xl bg-neutral-950 border border-neutral-850 p-3">
          <Input
            label="Rótulo da escolha"
            value={form.requiredChoice.label}
            onChange={(e) => setForm((f) => ({ ...f, requiredChoice: { ...f.requiredChoice!, label: e.target.value } }))}
            placeholder="Ex: Sabor"
          />
          <div className="flex flex-wrap gap-2">
            {form.requiredChoice.options.map((opt, idx) => (
              <span key={idx} className="flex items-center gap-1 rounded-full bg-neutral-850 px-3 py-1 text-sm text-white">
                {opt}
                <button type="button" onClick={() => removeOption(idx)}><X size={14} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={optionInput}
              onChange={(e) => setOptionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Ex: Calabresa"
              className="h-11 flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none"
            />
            <Button type="button" variant="secondary" onClick={addOption}>Adicionar</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancelar</Button>
        <Button className="flex-1" disabled={!canSave || saving} onClick={() => onSave(form)}>{saving ? 'Salvando...' : 'Salvar'}</Button>
      </div>
    </div>
  );
}

export function MenuManagement() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<MenuItem[]>('/menu', { params: { includeArchived: 'true' } });
      setItems(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar cardápio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toFormState = (item: MenuItem): FormState => ({
    name: item.name,
    category: item.category,
    price: item.price,
    description: item.description || '',
    ingredients: item.ingredients,
    requiredChoice: item.requiredChoice,
  });

  const handleSave = async (form: FormState) => {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      price: form.price.trim(),
      description: form.description.trim() || null,
      ingredients: form.ingredients,
      requiredChoice: form.requiredChoice,
    };
    try {
      if (editing === 'new') {
        const { data } = await api.post<MenuItem>('/menu', payload);
        setItems((prev) => [...prev, data]);
      } else if (editing) {
        const { data } = await api.patch<MenuItem>(`/menu/${editing.id}`, payload);
        setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)));
      }
      setEditing(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const { data } = await api.patch<MenuItem>(`/menu/${item.id}/availability`, { available: !item.available });
      setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar disponibilidade.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleArchived = async (item: MenuItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const { data } = await api.patch<MenuItem>(`/menu/${item.id}/archive`, { archived: !item.archived });
      setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao arquivar item.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-neutral-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-neutral-850 pb-4">
        <div>
          <h3 className="text-lg font-black text-white font-display">Cardápio</h3>
          <p className="text-xs font-mono text-neutral-500">Itens, preços, disponibilidade e arquivamento</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} className="inline -mt-0.5 mr-1" /> Novo item
        </Button>
      </div>

      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-900 border border-neutral-850 p-3 ${item.archived ? 'opacity-50' : ''}`}>
            <div>
              <p className="font-semibold text-white">{item.name} <span className="text-[10px] font-mono uppercase text-neutral-500">{CATEGORIES.find((c) => c.value === item.category)?.label}</span></p>
              <p className="text-sm text-neutral-500">R$ {item.price}{item.archived ? ' · arquivado' : !item.available ? ' · indisponível' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-sm text-neutral-400">
                <input type="checkbox" checked={item.available} disabled={busyId === item.id || item.archived} onChange={() => toggleAvailability(item)} className="h-5 w-5" />
                Disponível
              </label>
              <Button variant="ghost" size="md" onClick={() => setEditing(item)} disabled={item.archived}><Pencil size={16} /></Button>
              <Button variant="ghost" size="md" onClick={() => toggleArchived(item)} disabled={busyId === item.id}>
                {item.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="py-10 text-center text-sm text-neutral-500">Nenhum item cadastrado.</p>}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Novo item' : 'Editar item'}>
        {editing && (
          <ItemForm
            initial={editing === 'new' ? emptyForm : toFormState(editing)}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            saving={saving}
          />
        )}
      </Modal>
    </div>
  );
}
