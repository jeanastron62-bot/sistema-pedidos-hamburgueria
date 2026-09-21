import { create } from 'zustand';
import { api } from '../services/api';
import type { Order } from '../types';

interface OrdersState {
  orders: Order[];
  isLoading: boolean;
  error: string | null;
  fetchOrders: (query?: Record<string, string>) => Promise<void>;
  upsertOrder: (order: Order) => void;
  patchOrder: (orderId: number, patch: Partial<Order>) => void;
}

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  isLoading: false,
  error: null,

  fetchOrders: async (query = {}) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams(query).toString();
      const { data } = await api.get(`/orders${params ? `?${params}` : ''}`);
      set({ orders: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Erro ao carregar pedidos.', isLoading: false });
    }
  },

  upsertOrder: (order) =>
    set((state) => {
      const exists = state.orders.some((o) => o.id === order.id);
      return {
        orders: exists ? state.orders.map((o) => (o.id === order.id ? order : o)) : [...state.orders, order],
      };
    }),

  patchOrder: (orderId, patch) =>
    set((state) => ({
      orders: state.orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o)),
    })),
}));
