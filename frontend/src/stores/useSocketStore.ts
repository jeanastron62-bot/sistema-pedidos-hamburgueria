import { create } from 'zustand';
import { getPublicSocket, getStaffSocket, disconnectSockets } from '../services/socket';
import { useCatalogStore } from './useCatalogStore';
import { useOrdersStore } from './useOrdersStore';
import { useWhatsappInboxStore } from './useWhatsappInboxStore';
import { useWhatsappThreadStore } from './useWhatsappThreadStore';
import { useAuthStore } from './useAuthStore';
import { playNewOrderAlert } from '../utils/alertSound';

// Quem precisa OUVIR pedido novo: garçom (atende a mesa/balcão) e chapista
// (começa a fazer). Entregador só se interessa por PRONTO, e ADM/TI olham o
// painel quando querem -- som lá seria ruído.
const ROLES_WITH_ORDER_SOUND = new Set(['GARCOM', 'CHAPISTA']);

interface SocketState {
  publicConnected: boolean;
  staffConnected: boolean;
  connectPublic: () => void;
  connectStaff: () => void;
  disconnectAll: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  publicConnected: false,
  staffConnected: false,

  connectPublic: () => {
    const socket = getPublicSocket();
    socket.off('connect').on('connect', () => set({ publicConnected: true }));
    socket.off('disconnect').on('disconnect', () => set({ publicConnected: false }));
    socket.off('system:public_config').on('system:public_config', (data: any) => { useCatalogStore.getState().updateConfig(data); });
    socket.off('menu:availability_changed').on('menu:availability_changed', (data: { menuItemId: number; available: boolean }) => { useCatalogStore.getState().updateMenuItemAvailability(data.menuItemId, data.available); });
  },

  connectStaff: () => {
    const socket = getStaffSocket();
    socket.off('connect').on('connect', () => set({ staffConnected: true }));
    socket.off('disconnect').on('disconnect', () => set({ staffConnected: false }));
    socket.off('order:created').on('order:created', (order: any) => {
      // Reconexão do socket pode reentregar um pedido que já está na lista --
      // só toca pra pedido realmente novo pra este painel.
      const isNew = !useOrdersStore.getState().orders.some((o) => o.id === order.id);
      useOrdersStore.getState().upsertOrder(order);
      const role = useAuthStore.getState().user?.role;
      if (isNew && role && ROLES_WITH_ORDER_SOUND.has(role)) playNewOrderAlert();
    });
    socket.off('order:status_changed').on('order:status_changed', (data: any) => { if (data.updatedOrder) useOrdersStore.getState().upsertOrder(data.updatedOrder); });
    socket.off('order:confirmed').on('order:confirmed', (data: any) => { if (data.updatedOrder) useOrdersStore.getState().upsertOrder(data.updatedOrder); });
    socket.off('order:accepted').on('order:accepted', (data: any) => { if (data.updatedOrder) useOrdersStore.getState().upsertOrder(data.updatedOrder); });
    socket.off('order:cancelled').on('order:cancelled', (data: any) => { useOrdersStore.getState().patchOrder(data.orderId, { status: 'CANCELADO', requiresStaffConfirmation: false }); });
    socket.off('order:problem_reported').on('order:problem_reported', (data: any) => { useOrdersStore.getState().patchOrder(data.orderId, { problems: data.problems }); });
    socket.off('menu:availability_changed').on('menu:availability_changed', (data: { menuItemId: number; available: boolean }) => { useCatalogStore.getState().updateMenuItemAvailability(data.menuItemId, data.available); });
    socket.off('system:config_changed').on('system:config_changed', (data: any) => { useCatalogStore.getState().updateConfig(data); });
    // Handoff = cliente esperando atendente. Toca pra qualquer role autorizada
    // na caixa de entrada (GARCOM, CHAPISTA, ADM, TI) -- diferente do som de
    // pedido novo, que é filtrado por ROLES_WITH_ORDER_SOUND: aqui é sempre
    // quem está de olho na fila que precisa saber, não um subconjunto.
    socket.off('whatsapp:handoff').on('whatsapp:handoff', (data: any) => {
      useWhatsappInboxStore.getState().addHandoff(data);
      playNewOrderAlert();
    });
    // Fase 17.3 -- existiam no backend desde aquela fase, mas nenhum cliente
    // conectado os escutava. Ligados agora, na 17.4, porque é aqui que a
    // thread aberta no painel passa a atualizar em tempo real.
    socket.off('whatsapp:message_received').on('whatsapp:message_received', (data: any) => {
      useWhatsappThreadStore.getState().handleMessageReceived(data);
    });
    socket.off('whatsapp:message_sent').on('whatsapp:message_sent', (data: any) => {
      useWhatsappThreadStore.getState().handleMessageSent(data);
    });
  },

  disconnectAll: () => {
    disconnectSockets();
    set({ publicConnected: false, staffConnected: false });
  },
}));
