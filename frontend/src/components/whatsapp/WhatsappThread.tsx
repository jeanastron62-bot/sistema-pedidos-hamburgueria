import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { useWhatsappThreadStore, type ThreadMessage } from '../../stores/useWhatsappThreadStore';
import type { InboxConversation } from '../../stores/useWhatsappInboxStore';

const MOTIVO_LABEL: Record<string, string> = {
  BAIRRO_FORA_DA_LISTA: 'Bairro fora da lista',
  PEDIDO_AGENDADO: 'Pedido agendado',
  RECLAMACAO: 'Reclamação',
  CLIENTE_PEDIU_ATENDENTE: 'Cliente pediu atendente',
  OUTRO: 'Outro',
  JSON_LEAK: 'Falha do bot — ação não executada',
  TOOL_LOOP_EXHAUSTED: 'Falha do bot — travou tentando',
};

// Fase 17.4 -- regra de EXIBIÇÃO, não escreve nada no banco (ver comentário
// em whatsapp.service.ts, getConversationMessages). PENDENTE recente é
// "enviando", só depois de 5 minutos sem confirmação da Graph é que o
// atendente precisa saber que pode não ter chegado -- antes disso é spinner
// eterno seria enganoso na direção contrária (parece que travou quando só
// está demorando o normal).
const LIMIAR_NAO_SEI_SE_CHEGOU_MS = 5 * 60_000;

function statusLabel(m: ThreadMessage, agora: number): { texto: string; alerta: boolean } | null {
  if (m.direction !== 'OUT' || !m.deliveryStatus) return null; // nulo = anterior à correção, trata como entregue
  if (m.deliveryStatus === 'FALHOU') return { texto: 'não entregue' + (m.failureReason ? ` — ${m.failureReason}` : ''), alerta: true };
  if (m.deliveryStatus === 'PENDENTE') {
    const idadeMs = agora - new Date(m.createdAt).getTime();
    return idadeMs > LIMIAR_NAO_SEI_SE_CHEGOU_MS
      ? { texto: 'não sei se chegou', alerta: true }
      : { texto: 'enviando…', alerta: false };
  }
  return null; // ENVIADA -- caso normal, sem rótulo
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  conversation: InboxConversation;
  onBack: () => void;
  onResume: (id: number) => void;
  resuming: boolean;
}

export function WhatsappThread({ conversation, onBack, onResume, resuming }: Props) {
  const {
    messages,
    isLoading,
    isSending,
    loadError,
    sendError,
    windowExpiresAt,
    openThread,
    closeThread,
    sendReply,
  } = useWhatsappThreadStore();
  const [text, setText] = useState('');
  const [agora, setAgora] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openThread(conversation.id);
    return () => closeThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Reavalia "não sei se chegou" com o tempo passando, sem depender de
  // mensagem nova chegar pra re-renderizar.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const janelaFechada = conversation.windowExpiresAt
    ? new Date(conversation.windowExpiresAt).getTime() <= Date.now()
    : true;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    const ok = await sendReply(trimmed);
    if (ok) setText('');
  };

  return (
    <div className="flex h-full min-h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-850 pb-3">
        <button
          onClick={onBack}
          aria-label="Voltar pra lista"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-850 text-neutral-300 hover:text-white"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold text-white">{conversation.phone}</span>
          {conversation.handoffMotivo && (
            <span className="w-fit rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-amber-300">
              {MOTIVO_LABEL[conversation.handoffMotivo] ?? conversation.handoffMotivo}
            </span>
          )}
        </div>
        {conversation.botPaused && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => onResume(conversation.id)}
            disabled={resuming}
            className="shrink-0"
          >
            {resuming ? 'Retomando...' : 'Retomar bot'}
          </Button>
        )}
      </div>

      {conversation.handoffResumo && (
        <p className="border-b border-neutral-850 py-2 text-sm text-neutral-400">{conversation.handoffResumo}</p>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto py-3">
        {isLoading && messages.length === 0 && <p className="text-center text-sm text-neutral-500">Carregando...</p>}
        {loadError && <p className="text-center text-sm text-red-400">{loadError}</p>}

        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const status = statusLabel(m, agora);
            const isOut = m.direction === 'OUT';
            return (
              <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    isOut ? 'bg-primary/20 border border-primary/30' : 'bg-neutral-850 border border-neutral-750'
                  }`}
                >
                  {isOut && m.sentByName && (
                    <p className="text-xs font-mono font-bold uppercase tracking-wider text-primary/80">
                      {m.sentByName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-white">{m.content ?? '(sem texto)'}</p>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    {status && (
                      <span className={`text-xs ${status.alerta ? 'text-amber-400' : 'text-neutral-500'}`}>
                        {status.texto}
                      </span>
                    )}
                    <span className="text-xs text-neutral-600">{horaCurta(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-neutral-850 pt-3">
        {janelaFechada ? (
          <p className="rounded-xl bg-neutral-900 border border-neutral-800 p-3 text-sm text-neutral-500">
            Passou de 24h desde a última mensagem do cliente. Só ele pode reabrir a conversa — não é possível
            enviar por aqui agora.
          </p>
        ) : (
          <>
            {sendError && (
              <p className="mb-2 rounded-xl bg-red-950/40 border border-red-900/60 p-2 text-sm text-red-300">
                {sendError}
                {windowExpiresAt && ' A janela fechou enquanto você digitava.'}
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Escreva a resposta..."
                rows={1}
                className="min-h-[48px] flex-1 resize-none rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none"
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleSend}
                disabled={isSending || !text.trim()}
                aria-label="Enviar resposta"
                className="!px-4"
              >
                <Send size={20} />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
