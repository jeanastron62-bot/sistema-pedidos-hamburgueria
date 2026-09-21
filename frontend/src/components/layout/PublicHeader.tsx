import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useCartStore } from '../../stores/useCartStore';
import { isDeliveryTimeBlocked } from '../../utils/deliveryWindow';
import { isEffectivelyOpen } from '../../utils/trailerSchedule';

interface PublicHeaderProps {
  onCartClick: () => void;
}

export function PublicHeader({ onCartClick }: PublicHeaderProps) {
  const config = useCatalogStore((s) => s.config);
  const itemCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const trailerClosed = config !== null && !isEffectivelyOpen(config);
  const deliveryClosed =
    config !== null &&
    !trailerClosed &&
    config.deliveryActive &&
    isDeliveryTimeBlocked(config.deliveryExtendedUntil);

  return (
    <>
      {trailerClosed && (
        <div className="bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white">
          ⚠️ Trailer fechado no momento. Não estamos recebendo pedidos.
        </div>
      )}
      {deliveryClosed && (
        <div className="bg-amber-700 px-4 py-2 text-center text-sm font-semibold text-white">
          ⚠️ Delivery disponível das 18h às 00h. Retirada e mesa continuam disponíveis a qualquer hora.
        </div>
      )}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-neutral-900 border-b border-neutral-850 px-4 py-3 shadow-md">
        <h1 className="text-xl font-black text-white font-display">Pedidos <span className="text-primary">Trailer</span></h1>

        <div className="flex items-center gap-3">
          <Link to="/login" className="text-xs text-neutral-500 hover:text-white transition-colors">
            Acesso da equipe
          </Link>
          <button
            onClick={onCartClick}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white"
            aria-label="Carrinho"
          >
            <ShoppingCart size={22} />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-xs font-bold text-black">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>
    </>
  );
}
