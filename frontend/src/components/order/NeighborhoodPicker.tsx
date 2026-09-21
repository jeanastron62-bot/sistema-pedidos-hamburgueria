import { Select } from '../ui/Select';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { formatMoney, toCents } from '../../utils/money';
import { getWhatsappLink } from '../../utils/whatsapp';

export const OUTRO_BAIRRO = '__outro__';

interface NeighborhoodPickerProps {
  value: string;
  onChange: (value: string) => void;
  contactPhone: string;
}

export function NeighborhoodPicker({ value, onChange, contactPhone }: NeighborhoodPickerProps) {
  const neighborhoods = useCatalogStore((s) => s.neighborhoods);
  const activeNeighborhoods = neighborhoods.filter((n) => n.active !== false);
  const isOutro = value === OUTRO_BAIRRO;
  const whatsappUrl = getWhatsappLink(contactPhone);

  return (
    <>
      <Select label="Bairro" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione...</option>
        {activeNeighborhoods.map((n) => (<option key={n.id} value={n.id}>{n.name} — {formatMoney(toCents(n.deliveryFee))}</option>))}
        <option value={OUTRO_BAIRRO}>Outro bairro (ligar para confirmar)</option>
      </Select>
      {isOutro && (<div className="rounded-lg bg-bg-elevated p-3 text-sm text-white/80">Esse bairro não está na lista. Ligue para confirmar: <a href={whatsappUrl} className="text-secondary" target="_blank" rel="noreferrer">{contactPhone}</a></div>)}
    </>
  );
}
