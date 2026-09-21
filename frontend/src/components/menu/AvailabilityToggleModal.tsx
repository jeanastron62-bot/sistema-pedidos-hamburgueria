import { Modal } from '../ui/Modal';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { api } from '../../services/api';

interface AvailabilityToggleModalProps {
  open: boolean;
  onClose: () => void;
}

export function AvailabilityToggleModal({ open, onClose }: AvailabilityToggleModalProps) {
  const menuItems = useCatalogStore((s) => s.menuItems);
  const updateMenuItemAvailability = useCatalogStore((s) => s.updateMenuItemAvailability);

  const handleToggle = async (id: number, current: boolean) => {
    updateMenuItemAvailability(id, !current);
    try {
      await api.patch(`/menu/${id}/availability`, { available: !current });
    } catch {
      updateMenuItemAvailability(id, current);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Disponibilidade do cardápio">
      <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
        {menuItems.filter((i) => !i.archived).map((item) => (
          <button key={item.id} onClick={() => handleToggle(item.id, item.available)} className={`flex items-center justify-between rounded-xl p-3 text-left transition-colors ${item.available ? 'bg-neutral-900/50 border border-neutral-850' : 'bg-red-950/30 border border-red-900/40'}`}>
            <span className="text-sm text-white">{item.name}</span>
            <span className={`text-xs font-mono font-bold uppercase ${item.available ? 'text-emerald-400' : 'text-red-400'}`}>{item.available ? 'Disponível' : 'Esgotado'}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
