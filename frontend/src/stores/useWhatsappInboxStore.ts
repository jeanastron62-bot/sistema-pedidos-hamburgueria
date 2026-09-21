import { create } from 'zustand';
import { api } from '../services/api';

// Fase 17 -- a rota GET /conversations/paused morreu (findMany sem take,
// ordenado por updatedAt). O substituto é GET /conversations, paginado, que
// devolve { items, total, pending, nextCursor }.
//
// `pending` é o número do selo da aba Atendimento. Os três painéis usam
// `fetchPendingCount()`, que chama a rota com `limit=0` e recebe SÓ os
// totais, sem itens: carregar 20 conversas pra mostrar um selo é desperdício
// num Android de 2 GB.
export interface InboxConversation {
  id: number;
  phone: string;
  botPaused: boolean;
  lastInboundAt: string | null;
  handoffAt: string | null;
  handoffMotivo: string | null;
  handoffResumo: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  lastMessage: string | null;
  windowExpiresAt: string | null;
  // Bucket de prioridade calculado no servidor: pausada, sem resposta da
  // equipe depois da última mensagem do cliente, e dentro das últimas 12h.
  // Abrir a conversa NÃO muda isso; só responder muda.
  pending: boolean;
}

interface InboxResponse {
  items: InboxConversation[];
  total: number;
  pending: number;
  nextCursor: string | null;
}

interface WhatsappHandoffEvent {
  conversationId: number;
  phone: string;
  motivo: string | null;
  resumo: string | null;
}

export type InboxView = 'pending' | 'all';

interface WhatsappInboxState {
  conversations: InboxConversation[];
  pendingCount: number;
  total: number;
  nextCursor: string | null;
  isLoading: boolean;
  error: string | null;
  // Fase 17.4 -- as duas visões da aba: pending (default, o que precisa de
  // atendimento agora) e all (todas as conversas ativas nas últimas 12h,
  // NÃO o histórico inteiro -- o corte é da consulta no backend, ver
  // RECENCY_SQL em whatsapp.service.ts).
  view: InboxView;
  setView: (view: InboxView) => void;
  fetchConversations: () => Promise<void>;
  fetchPendingCount: () => Promise<void>;
  addHandoff: (event: WhatsappHandoffEvent) => void;
  removeConversation: (id: number) => void;
  patchConversation: (id: number, patch: Partial<InboxConversation>) => void;
}

const LIMIT = 20;

export const useWhatsappInboxStore = create<WhatsappInboxState>((set, get) => ({
  conversations: [],
  pendingCount: 0,
  total: 0,
  nextCursor: null,
  isLoading: false,
  error: null,
  view: 'pending',

  setView: (view) => {
    set({ view });
    get().fetchConversations();
  },

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<InboxResponse>(
        `/webhook/whatsapp/conversations?limit=${LIMIT}&view=${get().view}`
      );
      set({
        conversations: data.items,
        pendingCount: data.pending,
        total: data.total,
        nextCursor: data.nextCursor,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Erro ao carregar conversas.', isLoading: false });
    }
  },

  // Só o número, sem itens. É o que os painéis chamam no mount.
  fetchPendingCount: async () => {
    try {
      const { data } = await api.get<InboxResponse>('/webhook/whatsapp/conversations?limit=0');
      set({ pendingCount: data.pending, total: data.total });
    } catch {
      // Selo é informação secundária: falhar aqui não pode poluir a tela de
      // pedidos com erro. O número fica como está.
    }
  },

  // Evento em tempo real -- o GET inicial pode ter rodado antes deste
  // handoff; sem isso a conversa só apareceria no próximo reload.
  addHandoff: (event) =>
    set((state) => {
      if (state.conversations.some((c) => c.id === event.conversationId)) {
        return { pendingCount: state.pendingCount };
      }
      const agora = new Date().toISOString();
      return {
        pendingCount: state.pendingCount + 1,
        total: state.total + 1,
        conversations: [
          {
            id: event.conversationId,
            phone: event.phone,
            botPaused: true,
            lastInboundAt: agora,
            handoffAt: agora,
            handoffMotivo: event.motivo,
            handoffResumo: event.resumo,
            lastReadAt: null,
            unreadCount: 1,
            lastMessage: null,
            windowExpiresAt: null,
            pending: true,
          },
          ...state.conversations,
        ],
      };
    }),

  removeConversation: (id) =>
    set((state) => {
      const alvo = state.conversations.find((c) => c.id === id);
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        pendingCount: alvo?.pending ? Math.max(0, state.pendingCount - 1) : state.pendingCount,
      };
    }),

  // Atualização otimista de UMA linha da lista (ex.: unreadCount zerado ao
  // abrir a thread, lastMessage/pending depois de responder) -- sem refazer
  // o GET inteiro pra uma mudança pequena.
  patchConversation: (id, patch) =>
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
}));
