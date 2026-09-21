import type { CartItem as CartItemType } from '../../stores/useCartStore';
import { useCartStore } from '../../stores/useCartStore';
import { formatMoney } from '../../utils/money';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  const extrasTotal = item.extras.reduce((sum, e) => sum + e.unitPriceCents * e.quantity, 0);
  const lineTotal = (item.unitPriceCents + extrasTotal) * item.quantity;

  return (
    <div className="flex flex-col gap-1 border-b border-white/10 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white">{item.menuItemName}</p>
          {item.selectedChoice && <p className="text-xs text-white/60">{item.selectedChoice}</p>}
          {item.extras.map((extra) => (
            <p key={extra.menuItemId} className="text-xs text-white/60">
              + {extra.quantity}x {extra.menuItemName}
            </p>
          ))}
          {item.observations && <p className="text-xs italic text-white/50">"{item.observations}"</p>}
        </div>
        <span className="whitespace-nowrap font-semibold text-secondary">{formatMoney(lineTotal)}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => updateQuantity(item.cartItemId, -1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-elevated text-white"
        >
          −
        </button>
        <span className="w-4 text-center text-white">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.cartItemId, 1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-elevated text-white"
        >
          +
        </button>
        <button onClick={() => removeItem(item.cartItemId)} className="ml-auto text-xs text-red-400">
          Remover
        </button>
      </div>
    </div>
  );
}
