import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { useWhatsappInboxStore } from '../../stores/useWhatsappInboxStore';
import { WhatsappThread } from './WhatsappThread';

const MOTIVO_LABEL: Record<string, string> = {
  BAIRRO_FORA_DA_LISTA: 'Bairro fora da lista',
  PEDIDO_AGENDADO: 'Pedido agendado',
  RECLAMACAO: 'Reclamação',
  CLIENTE_PEDIU_ATENDENTE: 'Cliente pediu atendente',
  // OUTRO saiu do enum da tool (era o coringa que o modelo usava pra escalar
  // por conveniência); fica aqui só pra rotular conversa pausada antes disso.
  OUTRO: 'Outro',
  // Fase 16 -- pausa de segurança do próprio bot, não pedido do cliente. O
  // atendente precisa saber que a ação que o bot tentou fazer NÃO aconteceu.
  JSON_LEAK: 'Falha do bot — ação não executada',
  TOOL_LOOP_EXHAUSTED: 'Falha do bot — travou tentando',
};

function timeSince(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export function WhatsappInbox() {
  const { conversations, isLoading, error, view, setView, fetchConversations, removeConversation } =
    useWhatsappInboxStore();
  const [resumingId, setResumingId] = useState<number | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  // Mobile primeiro -- uma coluna por vez. Selecionar uma conversa TROCA a
  // lista pela thread (não divide a tela); "Voltar" troca de volta.
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => { fetchConversations(); }, [fetchConversations, view]);

  const handleResume = async (id: number) => {
    setResumingId(id);
    setResumeError(null);
    try {
      await api.patch(`/webhook/whatsapp/conversations/${id}/resume`);
      removeConversation(id);
      if (openId === id) setOpenId(null);
    } catch (err: any) {
      setResumeError(err.response?.data?.error || 'Erro ao retomar o bot.');
    } finally {
      setResumingId(null);
    }
  };

  const aberta = openId != null ? conversations.find((c) => c.id === openId) : null;
  if (aberta) {
    return (
      <WhatsappThread
        conversation={aberta}
        onBack={() => setOpenId(null)}
        onResume={handleResume}
        resuming={resumingId === aberta.id}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="text-lg font-black text-white font-display">Atendimento</h3>
        <p className="text-xs font-mono text-neutral-500">
          Conversas do WhatsApp das últimas 12h — o turno atual. As que precisam de resposta vêm primeiro.
        </p>
      </div>

      <Tabs
        items={[
          { key: 'pending', label: 'Pendentes' },
          { key: 'all', label: 'Todas' },
        ]}
        active={view}
        onChange={(key) => setView(key as 'pending' | 'all')}
      />

      {(error || resumeError) && (
        <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">
          {error || resumeError}
        </p>
      )}

      {isLoading ? (
        <p className="text-neutral-500">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setOpenId(c.id);
              }}
              className={`flex min-h-[48px] cursor-pointer flex-wrap items-center justify-between gap-3 rounded-2xl bg-neutral-900 border p-4 text-left transition-colors hover:bg-neutral-850 ${c.pending ? 'border-primary/50 border-t-2 border-t-primary' : 'border-neutral-850'}`}
            >
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{c.phone}</span>
                  {c.handoffMotivo && (
                    <span className="rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-amber-300">
                      {MOTIVO_LABEL[c.handoffMotivo] ?? c.handoffMotivo}
                    </span>
                  )}
                </div>
                {c.handoffResumo && <p className="text-sm text-neutral-400">{c.handoffResumo}</p>}
                {c.lastMessage && !c.handoffResumo && (
                  <p className="truncate text-sm text-neutral-500">{c.lastMessage}</p>
                )}
                {/* Fase 17 -- cronômetro a partir de handoffAt, NUNCA de
                    updatedAt: updatedAt muda a cada escrita na linha e
                    deliveryGraceUntil é escrito a cada mensagem entre 18h e
                    23h59, então "pausada há X" por updatedAt mentia. */}
                <p className="text-xs font-mono text-neutral-600">
                  {c.handoffAt ? `esperando ${timeSince(c.handoffAt)}` : `última msg ${c.lastInboundAt ? timeSince(c.lastInboundAt) : '--'}`}
                  {c.unreadCount > 0 && ` · ${c.unreadCount} não lida${c.unreadCount > 1 ? 's' : ''}`}
                </p>
              </div>
              {/* Degradação corrigida: "Retomar bot" só aparece se o bot
                  estiver de fato pausado. Antes aparecia em toda conversa.
                  stopPropagation pra não abrir a thread junto (botão dentro
                  de linha clicável). */}
              {c.botPaused && (
                <Button
                  variant="secondary"
                  size="md"
                  disabled={resumingId === c.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResume(c.id);
                  }}
                >
                  {resumingId === c.id ? 'Retomando...' : 'Retomar bot'}
                </Button>
              )}
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-500">
              {view === 'pending' ? 'Nenhuma conversa esperando atendente.' : 'Nenhuma conversa ativa nas últimas 12h.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
