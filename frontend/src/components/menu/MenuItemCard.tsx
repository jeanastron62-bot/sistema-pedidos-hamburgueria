import type { MenuItem } from '../../types';
import { formatMoneyFromString } from '../../utils/money';
import { UnavailableBadge } from './UnavailableBadge';

interface MenuItemCardProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  disabled?: boolean;
}

export function MenuItemCard({ item, onSelect, disabled }: MenuItemCardProps) {
  const ingredientsText = item.ingredients.join(', ');
  const blocked = disabled || !item.available;

  return (
    <div className={`flex flex-col gap-2 rounded-xl bg-bg-surface p-4 ${!item.available ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-white">{item.name}</h3>
        <span className="whitespace-nowrap text-base font-bold text-secondary">
          {formatMoneyFromString(item.price)}
        </span>
      </div>

      {item.description && (
        <span className="w-fit rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary">
          {item.description}
        </span>
      )}

      {ingredientsText && <p className="text-sm text-white/60">{ingredientsText}</p>}

      <div className="mt-1">
        {!item.available ? (
          <UnavailableBadge />
        ) : (
          <button
            onClick={() => onSelect(item)}
            disabled={blocked}
            className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-40"
          >
            Adicionar
          </button>
        )}
      </div>
    </div>
  );
}
