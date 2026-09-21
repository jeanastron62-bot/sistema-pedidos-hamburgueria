import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface CancelOrderModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => Promise<void>;
}

export function CancelOrderModal({ open, onClose, onConfirm }: CancelOrderModalProps) {
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setNotes('');
    setConfirming(false);
    setSubmitting(false);
    setError(null);
    onClose();
  };

  const handleFinalConfirm = async () => {
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
        <label htmlFor="cancel-notes" className="text-sm text-white/70">Esta ação é irreversível e fica registrada na auditoria. Descreva o motivo.</label>
        <textarea id="cancel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" className="h-20 w-full resize-none rounded-lg border border-white/10 bg-bg-elevated p-3 text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!confirming ? (
          <Button variant="danger" size="lg" disabled={!notes.trim()} onClick={() => setConfirming(true)}>Cancelar pedido</Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm font-semibold text-red-400">Toque novamente para confirmar. Isso não pode ser desfeito.</p>
            <Button variant="danger" size="lg" disabled={submitting} onClick={handleFinalConfirm}>{submitting ? 'Cancelando...' : 'Confirmar cancelamento'}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
