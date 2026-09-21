import { useEffect, useRef, useState } from 'react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { api } from '../../services/api';
import { isEffectivelyOpen, minutesUntilClose } from '../../utils/trailerSchedule';
import { Button } from '../ui/Button';
import type { SystemConfig } from '../../types';

const TICK_MS = 60_000;
const WARNING_THRESHOLD_MIN = 10;

// PATCH /config/trailer/reschedule-close espera HH:MM em horário de Brasília
// -- extrai isso do instante-alvo sem depender do fuso do navegador.
function toBrasiliaHHMM(date: Date): string {
  return date.toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
}

// Banner de fechamento agendado do trailer -- painéis GARCOM, CHAPISTA, ADM,
// TI (Fase 11.3). Segue o mesmo padrão de polling local de PublicHeader.tsx:
// setInterval de 60s recalculando localmente, sem evento de socket novo --
// `system:config_changed` já existe e já mantém `config` atualizado.
export function TrailerBanner() {
  const config = useCatalogStore((s) => s.config);
  const updateConfig = useCatalogStore((s) => s.updateConfig);

  const [, forceTick] = useState(0);
  const [justClosed, setJustClosed] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCloseAt, setCustomCloseAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpenRef = useRef<boolean | null>(null);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const effectivelyOpen = config ? isEffectivelyOpen(config) : null;

  // Detecta a transição true -> false (era aberto no tick anterior, virou
  // fechado agora) -- não há cron gravando esse instante, é só a consequência
  // de uma conta ter passado a dar false (ver nota da Fase 11.3 no doc).
  useEffect(() => {
    if (effectivelyOpen === null) return;
    if (wasOpenRef.current === true && effectivelyOpen === false) setJustClosed(true);
    if (effectivelyOpen === true) setJustClosed(false);
    wasOpenRef.current = effectivelyOpen;
  }, [effectivelyOpen]);

  if (!config) return null;

  const runAction = async (action: () => Promise<SystemConfig>) => {
    setBusy(true);
    setError(null);
    try {
      const data = await action();
      updateConfig(data);
      setShowCustomInput(false);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || 'Erro ao atualizar o trailer.');
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = () => runAction(async () => (await api.patch<SystemConfig>('/config/trailer/open')).data);
  const handleCloseNow = () => runAction(async () => (await api.patch<SystemConfig>('/config/trailer/close')).data);

  const handleExtendOneHour = () => {
    if (!config.scheduledCloseAt) return;
    const target = new Date(new Date(config.scheduledCloseAt).getTime() + 60 * 60 * 1000);
    return runAction(async () =>
      (await api.patch<SystemConfig>('/config/trailer/reschedule-close', { closeAt: toBrasiliaHHMM(target) })).data
    );
  };

  const handleCustomClose = () =>
    runAction(async () => (await api.patch<SystemConfig>('/config/trailer/reschedule-close', { closeAt: customCloseAt })).data);

  if (justClosed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-200">
        <span>Trailer fechado — reabrir?</span>
        <div className="flex items-center gap-2">
          <Button variant="danger" size="md" onClick={handleReopen} disabled={busy}>Reabrir</Button>
          {error && <span className="text-red-300">{error}</span>}
        </div>
      </div>
    );
  }

  const minutes = minutesUntilClose(config.scheduledCloseAt);
  if (!effectivelyOpen || minutes === null || minutes > WARNING_THRESHOLD_MIN || minutes <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-950/30 border border-amber-900/50 p-3 text-sm text-amber-200">
      <span>Fechando em {minutes} min.</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="md" onClick={handleExtendOneHour} disabled={busy}>Adiar 1h</Button>
        {!showCustomInput ? (
          <Button variant="ghost" size="md" onClick={() => setShowCustomInput(true)} disabled={busy}>Escolher horário</Button>
        ) : (
          <>
            <input
              type="time"
              value={customCloseAt}
              onChange={(e) => setCustomCloseAt(e.target.value)}
              className="h-10 rounded-lg bg-neutral-950 border border-neutral-800 px-2 text-white"
            />
            <Button variant="secondary" size="md" onClick={handleCustomClose} disabled={busy || !customCloseAt}>Confirmar</Button>
          </>
        )}
        <Button variant="danger" size="md" onClick={handleCloseNow} disabled={busy}>Fechar agora</Button>
      </div>
      {error && <span className="text-red-300">{error}</span>}
    </div>
  );
}
