import { useEffect, useState } from 'react';
import { useCatalogStore } from '../stores/useCatalogStore';
import { useCartStore } from '../stores/useCartStore';
import { useSocketStore } from '../stores/useSocketStore';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { CategoryTabs } from '../components/menu/CategoryTabs';
import { VISIBLE_CATEGORIES, type MenuTab } from '../components/menu/categories';
import { MenuItemCard } from '../components/menu/MenuItemCard';
import { ItemCustomizationModal, type CustomizedItemResult } from '../components/menu/ItemCustomizationModal';
import { CartDrawer } from '../components/cart/CartDrawer';
import { Modal } from '../components/ui/Modal';
import { CheckoutForm } from '../components/cart/CheckoutForm';
import { toCents } from '../utils/money';
import { isEffectivelyOpen } from '../utils/trailerSchedule';
import type { Category, MenuItem } from '../types';

const NEEDS_MODAL_CATEGORIES: Category[] = ['HOT_DOGS', 'HAMBURGUERES', 'MACARRAO_NA_CHAPA'];

export default function PublicMenu() {
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const menuItems = useCatalogStore((s) => s.menuItems);
  const config = useCatalogStore((s) => s.config);
  const isLoading = useCatalogStore((s) => s.isLoading);
  const catalogError = useCatalogStore((s) => s.error);
  const connectPublic = useSocketStore((s) => s.connectPublic);
  const addItem = useCartStore((s) => s.addItem);

  const [activeTab, setActiveTab] = useState<MenuTab>('ALL');
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    fetchCatalog();
    connectPublic();
  }, [fetchCatalog, connectPublic]);

  const extrasOptions = menuItems.filter((i) => i.category === 'ACRESCIMOS' && i.available);
  const trailerOpen = config === null || isEffectivelyOpen(config);

  // Aba "Todos": grupos por categoria na ordem das abas, so os com item.
  const groups = VISIBLE_CATEGORIES
    .map((c) => ({ label: c.label, items: menuItems.filter((i) => i.category === c.key) }))
    .filter((g) => g.items.length > 0);
  const singleItems = activeTab === 'ALL' ? [] : menuItems.filter((i) => i.category === activeTab);
  const hasAnyItems = activeTab === 'ALL' ? groups.length > 0 : singleItems.length > 0;

  const handleSelectItem = (item: MenuItem) => {
    const needsModal = item.requiredChoice !== null || NEEDS_MODAL_CATEGORIES.includes(item.category);
    if (needsModal) {
      setModalItem(item);
    } else {
      addItem({
        menuItemId: item.id,
        menuItemName: item.name,
        unitPriceCents: toCents(item.price),
        quantity: 1,
        observations: null,
        selectedChoice: null,
        extras: [],
      });
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-neutral-950"
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 16px), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 16px)',
      }}
    >
      <PublicHeader onCartClick={() => setCartOpen(true)} />

      <main className="flex-1 px-4 py-4">
        <CategoryTabs<MenuTab> active={activeTab} onChange={setActiveTab} showTodos />

        {isLoading && <p className="mt-8 text-center text-neutral-500">Carregando cardápio...</p>}

        {catalogError && !isLoading && (
          <div className="mt-8 rounded-lg bg-red-950/40 border border-red-900/60 p-4 text-center text-red-300">
            Não foi possível carregar o cardápio agora. Puxe a tela para atualizar ou tente novamente em instantes.
            <button onClick={() => fetchCatalog()} className="mt-2 block w-full text-sm underline">Tentar de novo</button>
          </div>
        )}

        {!isLoading && !catalogError && !hasAnyItems && (
          <p className="mt-8 text-center text-neutral-500">Nenhum item disponível no momento.</p>
        )}

        {!isLoading && !catalogError && activeTab === 'ALL' && groups.map((g) => (
          <section key={g.label} className="mt-6">
            <h2 className="mb-3 font-display text-lg font-black text-white">{g.label}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.items.map((item) => (
                <MenuItemCard key={item.id} item={item} onSelect={handleSelectItem} disabled={!trailerOpen} />
              ))}
            </div>
          </section>
        ))}

        {!isLoading && !catalogError && activeTab !== 'ALL' && singleItems.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {singleItems.map((item) => (
              <MenuItemCard key={item.id} item={item} onSelect={handleSelectItem} disabled={!trailerOpen} />
            ))}
          </div>
        )}
      </main>

      <PublicFooter />

      <ItemCustomizationModal
        item={modalItem}
        extrasOptions={extrasOptions}
        onClose={() => setModalItem(null)}
        onConfirm={(result: CustomizedItemResult) => addItem(result)}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Finalizar Pedido">
        <CheckoutForm onClose={() => setCheckoutOpen(false)} />
      </Modal>
    </div>
  );
}
