import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { MenuItem } from '../../types';
import { toCents, formatMoney } from '../../utils/money';

export interface CustomizedItemResult {
  menuItemId: number;
  menuItemName: string;
  unitPriceCents: number;
  quantity: number;
  observations: string | null;
  selectedChoice: string | null;
  extras: { menuItemId: number; menuItemName: string; unitPriceCents: number; quantity: number }[];
}

interface ItemCustomizationModalProps {
  item: MenuItem | null;
  extrasOptions: MenuItem[];
  onClose: () => void;
  onConfirm: (result: CustomizedItemResult) => void;
}

export function ItemCustomizationModal({ item, extrasOptions, onClose, onConfirm }: ItemCustomizationModalProps) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [observations, setObservations] = useState('');
  const [extraQuantities, setExtraQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    setSelectedChoice(null);
    setObservations('');
    setExtraQuantities({});
  }, [item?.id]);

  if (!item) return null;

  const requiredChoice = item.requiredChoice;
  const needsChoice = !!requiredChoice;
  const canConfirm = !needsChoice || selectedChoice !== null;
  const unitPriceCents = toCents(item.price);

  const extrasTotalCents = extrasOptions.reduce((sum, extra) => {
    const qty = extraQuantities[extra.id] || 0;
    return sum + toCents(extra.price) * qty;
  }, 0);

  const handleExtraChange = (extraId: number, delta: number) => {
    setExtraQuantities((prev) => {
      const current = prev[extraId] || 0;
      return { ...prev, [extraId]: Math.max(0, current + delta) };
    });
  };

  const handleConfirm = () => {
    if (!canConfirm) return;

    const extras = extrasOptions
      .filter((extra) => (extraQuantities[extra.id] || 0) > 0)
      .map((extra) => ({
        menuItemId: extra.id,
        menuItemName: extra.name,
        unitPriceCents: toCents(extra.price),
        quantity: extraQuantities[extra.id],
      }));

    onConfirm({
      menuItemId: item.id,
      menuItemName: item.name,
      unitPriceCents,
      quantity: 1,
      observations: observations.trim() || null,
      selectedChoice,
      extras,
    });
    onClose();
  };

  return (
    <Modal open={!!item} onClose={onClose} title={item.name}>
      <div className="flex flex-col gap-4">
        {requiredChoice && (
          <div>
            <p className="mb-2 text-sm font-semibold text-white">{requiredChoice.label}</p>
            <div className="flex flex-wrap gap-2">
              {requiredChoice.options.map((option) => (
                <button
                  key={option}
                  onClick={() => setSelectedChoice(option)}
                  className={`h-11 rounded-lg px-4 text-sm font-medium ${
                    selectedChoice === option ? 'bg-primary text-white' : 'bg-bg-elevated text-white/70'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {extrasOptions.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-white">Acréscimos</p>
            <div className="flex flex-col gap-2">
              {extrasOptions.map((extra) => {
                const qty = extraQuantities[extra.id] || 0;
                return (
                  <div key={extra.id} className="flex items-center justify-between">
                    <span className="text-sm text-white/80">
                      {extra.name} · {formatMoney(toCents(extra.price))}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleExtraChange(extra.id, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-elevated text-white"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-white">{qty}</span>
                      <button
                        onClick={() => handleExtraChange(extra.id, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-elevated text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-semibold text-white">Observações</label>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Ex.: sem cebola"
            className="h-20 w-full resize-none rounded-lg border border-white/10 bg-bg-elevated p-3 text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none"
          />
        </div>

        <Button onClick={handleConfirm} disabled={!canConfirm} size="lg">
          Adicionar · {formatMoney(unitPriceCents + extrasTotalCents)}
        </Button>
      </div>
    </Modal>
  );
}
