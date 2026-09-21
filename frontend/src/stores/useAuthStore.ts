import { create } from 'zustand';
import type { Role } from '../types';

interface AuthUser {
  id: number;
  username: string;
  role: Role;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },
}));

export const DEFAULT_ROUTE_BY_ROLE: Record<Role, string> = {
  GARCOM: '/painel/garcom',
  CHAPISTA: '/painel/cozinha',
  ENTREGADOR: '/painel/entrega',
  ADM: '/painel/admin',
  TI: '/painel/ti',
};
