import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // onClose vive numa ref pra que o efeito abaixo dependa SÓ de `open`.
  // Todo chamador passa uma arrow inline (identidade nova a cada render), e
  // com `onClose` nas dependências o efeito rodava de novo a cada render do
  // pai -- inclusive a cada tecla digitada num textarea e a cada tick do
  // timer do CancelWithTimerModal -- e o `focus()` do botão Fechar roubava o
  // foco do campo. No celular isso fecha o teclado no meio da digitação.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-850 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-lg font-black text-white font-display">{title}</h2>}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-neutral-850 text-white"
            aria-label="Fechar"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
