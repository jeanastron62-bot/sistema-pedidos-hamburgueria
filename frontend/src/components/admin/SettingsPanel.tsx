import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { isEffectivelyOpen } from '../../utils/trailerSchedule';
import type { SystemConfig } from '../../types';

export function SettingsPanel() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [deliveryActive, setDeliveryActive] = useState(false);
  const [maxTables, setMaxTables] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactInstagram, setContactInstagram] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extending, setExtending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, forceTick] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<SystemConfig>('/config');
      setConfig(data);
      setTrailerOpen(data.trailerOpen);
      setDeliveryActive(data.deliveryActive);
      setMaxTables(String(data.maxTables));
      setContactPhone(data.contactPhone);
      setContactInstagram(data.contactInstagram);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // O fechamento automático (backend, trailerAutoClose.ts) e o abrir/fechar
  // feitos por outro painel chegam por system:config_changed no catalog
  // store. Sem isto, o checkbox "Trailer aberto" ficava mostrando o valor de
  // quando a aba foi aberta -- ligado com o trailer já fechado. Só os campos
  // de abertura são sincronizados, pra não apagar telefone/Instagram que o
  // ADM esteja editando.
  const liveTrailerOpen = useCatalogStore((s) => s.config?.trailerOpen);
  const liveScheduledCloseAt = useCatalogStore((s) => s.config?.scheduledCloseAt);
  useEffect(() => {
    if (liveTrailerOpen === undefined || liveScheduledCloseAt === undefined) return;
    setTrailerOpen(liveTrailerOpen);
    setConfig((prev) => prev ? {
      ...prev,
      trailerOpen: liveTrailerOpen,
      scheduledCloseAt: liveScheduledCloseAt,
      effectivelyOpen: isEffectivelyOpen({ trailerOpen: liveTrailerOpen, scheduledCloseAt: liveScheduledCloseAt }),
    } : prev);
  }, [liveTrailerOpen, liveScheduledCloseAt]);

  // Reavalia "Prorrogado até HH:MM" / "Sem prorrogação ativa" a cada 30s sem
  // precisar de outra ação do usuário -- extensionActive é derivado de
  // `new Date()` no corpo do componente, então um re-render já resolve.
  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.patch<SystemConfig>('/config', {
        trailerOpen,
        deliveryActive,
        maxTables: parseInt(maxTables, 10),
        contactPhone,
        contactInstagram,
      });
      setConfig(data);
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async () => {
    setExtending(true);
    setError(null);
    try {
      const { data } = await api.patch<SystemConfig>('/config/extend-delivery');
      setConfig(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao prorrogar delivery.');
    } finally {
      setExtending(false);
    }
  };

  if (loading) return <p className="text-neutral-500">Carregando...</p>;

  const extendedUntil = config?.deliveryExtendedUntil ? new Date(config.deliveryExtendedUntil) : null;
  const extensionActive = extendedUntil !== null && extendedUntil > new Date();

  // trailerOpen é só o marcador que esse checkbox edita -- quem manda de
  // verdade no bot/site/checkout é effectivelyOpen (considera o fechamento
  // agendado). Os dois podem divergir: o marcador fica `true` até alguém
  // desligar, mesmo depois que o horário agendado já passou.
  const scheduleExpired = config !== null && config.trailerOpen && !config.effectivelyOpen;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="text-lg font-black text-white font-display">Configurações</h3>
        <p className="text-xs font-mono text-neutral-500">Operação do trailer, delivery e contato</p>
      </div>

      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}
      {saved && <p className="rounded-lg bg-emerald-950/40 border border-emerald-900/60 p-3 text-sm text-emerald-300">Configurações salvas.</p>}

      <div className="rounded-xl bg-neutral-900 border border-neutral-850">
        <label className="flex items-center justify-between p-4">
          <span className="text-white">Trailer aberto</span>
          <input type="checkbox" checked={trailerOpen} onChange={(e) => setTrailerOpen(e.target.checked)} className="h-5 w-5" />
        </label>
        {config && (
          <p className={`px-4 pb-3 text-xs font-mono ${config.effectivelyOpen ? 'text-emerald-400' : 'text-red-400'}`}>
            Status real agora: {config.effectivelyOpen ? 'aberto pro cliente' : 'fechado pro cliente'}
          </p>
        )}
        {scheduleExpired && (
          <p className="mx-4 mb-3 rounded-lg bg-amber-950/40 border border-amber-900/60 p-3 text-xs text-amber-300">
            O fechamento agendado já venceu -- o trailer está fechado de verdade (bot e site tratam como fechado).
            O sistema desliga este marcador sozinho em instantes; reabra pra agendar o próximo fechamento.
          </p>
        )}
        <label className="flex items-center justify-between border-t border-neutral-850 p-4">
          <span className="text-white">Delivery ativo</span>
          <input type="checkbox" checked={deliveryActive} onChange={(e) => setDeliveryActive(e.target.checked)} className="h-5 w-5" />
        </label>
        <div className="border-t border-neutral-850 p-4">
          <p className="text-sm text-neutral-400">
            Corte automático de delivery às 00h.{' '}
            {extensionActive
              ? `Prorrogado até ${extendedUntil!.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
              : 'Sem prorrogação ativa.'}
          </p>
          <Button variant="secondary" size="md" className="mt-2 w-full" onClick={handleExtend} disabled={extending}>
            {extending ? 'Prorrogando...' : '+1h de delivery'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">Contato &amp; mesas</p>
        <Input label="Número de mesas" type="number" min={1} value={maxTables} onChange={(e) => setMaxTables(e.target.value)} />
        <Input label="Telefone de contato" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        <Input label="Instagram" value={contactInstagram} onChange={(e) => setContactInstagram(e.target.value)} />
      </div>

      <Button size="lg" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
    </div>
  );
}
