import { create } from 'zustand';
import { publicApi } from '../services/publicApi';
import type { MenuItem, Neighborhood, SystemConfig } from '../types';

interface CatalogState {
  menuItems: MenuItem[];
  neighborhoods: Neighborhood[];
  config: SystemConfig | null;
  isLoading: boolean;
  error: string | null;
  fetchCatalog: () => Promise<void>;
  updateConfig: (partial: Partial<SystemConfig>) => void;
  updateMenuItemAvailability: (menuItemId: number, available: boolean) => void;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  menuItems: [],
  neighborhoods: [],
  config: null,
  isLoading: false,
  error: null,

  fetchCatalog: async () => {
    set({ isLoading: true, error: null });
    try {
      const [menuRes, neighborhoodsRes, configRes] = await Promise.all([
        publicApi.get('/menu'),
        publicApi.get('/neighborhoods'),
        publicApi.get('/config'),
      ]);
      set({
        menuItems: menuRes.data,
        neighborhoods: neighborhoodsRes.data,
        config: configRes.data,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Erro ao carregar o cardápio.', isLoading: false });
    }
  },

  updateConfig: (partial) =>
    set((state) => ({ config: state.config ? { ...state.config, ...partial } : null })),

  updateMenuItemAvailability: (menuItemId, available) =>
    set((state) => ({
      menuItems: state.menuItems.map((item) =>
        item.id === menuItemId ? { ...item, available } : item,
      ),
    })),
}));
