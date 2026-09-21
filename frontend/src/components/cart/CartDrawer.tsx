import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useCartStore } from '../../stores/useCartStore';
import { formatMoney } from '../../utils/money';
import { CartItem } from './CartItem';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export function CartDrawer({ open, onClose, onCheckout }: CartDrawerProps) {
  const items = useCartStore((s) => s.items);
  const subtotalCents = useCartStore((s) => s.getSubtotalCents());

  return (
    <Modal open={open} onClose={onClose} title="Seu carrinho">
      {items.length === 0 ? (
        <p className="py-8 text-center text-white/60">Carrinho vazio.</p>
      ) : (
        <>
          <div className="max-h-[50vh] overflow-y-auto">
            {items.map((item) => (
              <CartItem key={item.cartItemId} item={item} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-lg font-semibold text-white">
            <span>Subtotal</span>
            <span>{formatMoney(subtotalCents)}</span>
          </div>
          <Button size="lg" className="mt-3 w-full" onClick={onCheckout}>
            Continuar
          </Button>
        </>
      )}
    </Modal>
  );
}
