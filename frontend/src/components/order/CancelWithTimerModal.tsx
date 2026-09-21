import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface CancelWithTimerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => Promise<void>;
}

// 5s: tempo suficiente pra evitar toque acidental sem virar espera. Era 10s,
// longo demais no meio do turno.
const TIMER_SECONDS = 5;

export function CancelWithTimerModal({ open, onClose, onConfirm }: CancelWithTimerModalProps) {
  const [notes, setNotes] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(TIMER_SECONDS);
    setError(null);
    const interval = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, [open]);

  const handleClose = () => { setNotes(''); setSubmitting(false); setError(null); onClose(); };
  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(notes.trim());
      handleClose();
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.response?.data?.error || 'Erro ao cancelar o pedido. Tente novamente.');
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Cancelar pedido">
      <div className="flex flex-col gap-3">
        <label htmlFor="cancel-timer-notes" className="text-sm text-neutral-400">Esta ação é irreversível e fica registrada na auditoria.</label>
        <textarea id="cancel-timer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" className="h-20 w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button variant="danger" size="lg" disabled={!notes.trim() || secondsLeft > 0 || submitting} onClick={handleConfirm}>{secondsLeft > 0 ? `Aguarde ${secondsLeft}s...` : submitting ? 'Cancelando...' : 'Confirmar cancelamento'}</Button>
      </div>
    </Modal>
  );
}
