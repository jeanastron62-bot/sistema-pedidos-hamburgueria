import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItemExtra {
  menuItemId: number;
  menuItemName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface CartItem {
  cartItemId: string;
  menuItemId: number;
  menuItemName: string;
  unitPriceCents: number;
  quantity: number;
  observations: string | null;
  selectedChoice: string | null;
  extras: CartItemExtra[];
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'cartItemId'>) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  getSubtotalCents: () => number;
}

function lineTotalCents(item: CartItem): number {
  const extrasTotal = item.extras.reduce((sum, e) => sum + e.unitPriceCents * e.quantity, 0);
  return (item.unitPriceCents + extrasTotal) * item.quantity;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => ({
          items: [...state.items, { ...item, cartItemId: `${Date.now()}-${Math.random()}` }],
        })),
      removeItem: (cartItemId) =>
        set((state) => ({ items: state.items.filter((i) => i.cartItemId !== cartItemId) })),
      updateQuantity: (cartItemId, delta) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.cartItemId === cartItemId
              ? { ...item, quantity: Math.max(1, item.quantity + delta) }
              : item,
          ),
        })),
      clearCart: () => set({ items: [] }),
      getSubtotalCents: () => get().items.reduce((sum, item) => sum + lineTotalCents(item), 0),
    }),
    { name: 'sistema-pedidos-cart' },
  ),
);
