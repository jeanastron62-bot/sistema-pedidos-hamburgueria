import { create } from 'zustand';
import { api } from '../services/api';
import { useWhatsappInboxStore } from './useWhatsappInboxStore';

// Fase 17.5 -- estados possíveis de uma mensagem OUT. Nulo é registro
// anterior à correção da 17.2, sem backfill -- ver comentário no schema
// (WhatsappMessage.deliveryStatus). Trata-se como ENVIADA na exibição.
export type DeliveryStatus = 'PENDENTE' | 'ENVIADA' | 'FALHOU' | null;

export interface ThreadMessage {
  id: number;
  direction: 'IN' | 'OUT';
  content: string | null;
  sentByName: string | null;
  createdAt: string;
  deliveryStatus: DeliveryStatus;
  failureReason: string | null;
  waMessageId: string | null;
}

interface ThreadResponse {
  items: ThreadMessage[];
  hasMore: boolean;
}

interface WhatsappThreadState {
  activeConversationId: number | null;
  messages: ThreadMessage[];
  hasMore: boolean;
  isLoading: boolean;
  isSending: boolean;
  loadError: string | null;
  sendError: string | null;
  windowExpiresAt: string | null;
  openThread: (conversationId: number) => Promise<void>;
  closeThread: () => void;
  loadOlder: () => Promise<void>;
  sendReply: (text: string) => Promise<boolean>;
  // Fase 17.3 (ligada agora, na 17.4) -- eventos de socket. Só se aplicam à
  // thread aberta; a lista de conversas tem seu próprio caminho (addHandoff).
  handleMessageReceived: (data: { conversationId: number; content: string | null; createdAt: string }) => void;
  handleMessageSent: (data: { conversationId: number; content: string | null; sentByName: string; createdAt: string }) => void;
}

export const useWhatsappThreadStore = create<WhatsappThreadState>((set, get) => ({
  activeConversationId: null,
  messages: [],
  hasMore: false,
  isLoading: false,
  isSending: false,
  loadError: null,
  sendError: null,
  windowExpiresAt: null,

  openThread: async (conversationId) => {
    set({
      activeConversationId: conversationId,
      messages: [],
      isLoading: true,
      loadError: null,
      sendError: null,
    });
    try {
      const { data } = await api.get<ThreadResponse>(
        `/webhook/whatsapp/conversations/${conversationId}/messages?limit=50`
      );
      set({ messages: data.items, hasMore: data.hasMore, isLoading: false });
      // Abrir marca como lida -- não muda prioridade (só responder muda, ver
      // PENDING_SQL), só zera o contador de não-lidas desta conversa na lista.
      await api.patch(`/webhook/whatsapp/conversations/${conversationId}/read`);
      useWhatsappInboxStore.getState().patchConversation(conversationId, { unreadCount: 0 });
    } catch (err: any) {
      set({ loadError: err.response?.data?.error || 'Erro ao carregar a conversa.', isLoading: false });
    }
  },

  closeThread: () => set({ activeConversationId: null, messages: [], loadError: null, sendError: null }),

  loadOlder: async () => {
    const { activeConversationId, messages, hasMore, isLoading } = get();
    if (!activeConversationId || !hasMore || isLoading || messages.length === 0) return;
    set({ isLoading: true });
    try {
      const before = messages[0].createdAt;
      const { data } = await api.get<ThreadResponse>(
        `/webhook/whatsapp/conversations/${activeConversationId}/messages?limit=50&before=${encodeURIComponent(before)}`
      );
      set({ messages: [...data.items, ...messages], hasMore: data.hasMore, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  // true = enviou. false = não enviou (erro já fica em sendError/windowExpiresAt).
  //
  // ARMADILHA DE ORDEM (achada rodando de verdade num navegador, não só no
  // tsc): sendPanelMessage EMITE whatsapp:message_sent e só DEPOIS retorna
  // pro controller, que só então manda a resposta HTTP -- então o socket
  // sempre chega no navegador ANTES da promise deste POST resolver. Se cada
  // caminho conferisse duplicata só contra o que JÁ estava no estado no
  // momento em que come çou, os dois veriam a lista sem a mensagem e os dois
  // adicionariam -- foi exatamente o que uma prova real no navegador pegou
  // (mensagem aparecia duas vezes). Por isso o dedup mora DENTRO do
  // callback de `set`, que sempre vê o estado mais recente na hora de
  // escrever, nunca um instantâneo tirado antes do await.
  sendReply: async (text) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return false;
    set({ isSending: true, sendError: null });
    try {
      const { data } = await api.post<ThreadMessage>(
        `/webhook/whatsapp/conversations/${activeConversationId}/messages`,
        { text }
      );
      set((state) => ({
        isSending: false,
        messages: state.messages.some((m) => m.direction === 'OUT' && m.createdAt === data.createdAt && m.content === data.content)
          ? state.messages
          : [...state.messages, data],
      }));
      // Responder muda a prioridade (sai do bucket) -- a lista precisa saber,
      // não só esta thread.
      useWhatsappInboxStore.getState().fetchConversations();
      return true;
    } catch (err: any) {
      set({
        isSending: false,
        sendError: err.response?.data?.error || 'Erro ao enviar a resposta.',
        windowExpiresAt: err.response?.data?.windowExpiresAt ?? null,
      });
      return false;
    }
  },

  handleMessageReceived: (data) => {
    set((state) => {
      if (data.conversationId !== state.activeConversationId) return {};
      return {
        messages: [
          ...state.messages,
          {
            id: -Date.now(), // provisório, sem id real -- só pra key/render até o próximo fetch
            direction: 'IN' as const,
            content: data.content,
            sentByName: null,
            createdAt: data.createdAt,
            deliveryStatus: null,
            failureReason: null,
            waMessageId: null,
          },
        ],
      };
    });
    // Conversa está com a thread aberta -- mantém lida em tempo real. Fora
    // do set() de propósito: é um efeito colateral (chamada de rede), não
    // parte da atualização de estado.
    if (get().activeConversationId === data.conversationId) {
      api.patch(`/webhook/whatsapp/conversations/${data.conversationId}/read`).catch(() => {});
    }
  },

  handleMessageSent: (data) => {
    set((state) => {
      if (data.conversationId !== state.activeConversationId) return {};
      // sendReply já injeta a mensagem otimisticamente na thread de quem
      // enviou; este dedup cobre a SEGUNDA aba/painel com a mesma thread
      // aberta (que não passou por sendReply) E a corrida com o próprio
      // sendReply descrita no comentário dele.
      if (state.messages.some((m) => m.direction === 'OUT' && m.createdAt === data.createdAt && m.content === data.content)) {
        return {};
      }
      return {
        messages: [
          ...state.messages,
          {
            id: -Date.now(),
            direction: 'OUT' as const,
            content: data.content,
            sentByName: data.sentByName,
            createdAt: data.createdAt,
            deliveryStatus: 'ENVIADA' as const,
            failureReason: null,
            waMessageId: null,
          },
        ],
      };
    });
  },
}));
