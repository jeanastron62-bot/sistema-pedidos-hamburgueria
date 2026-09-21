import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { PeriodSelection } from '../../hooks/usePeriodSelection';
import type { PeriodKey } from '../../utils/periods';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
  { key: 'ano', label: 'Ano' },
];

interface PeriodSelectorProps {
  period: PeriodSelection;
  onPeriodChange: (period: PeriodSelection) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onApplyCustom: () => void;
}

export function PeriodSelector({
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
}: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {PERIOD_OPTIONS.map((opt) => (
        <Button
          key={opt.key}
          variant={period === opt.key ? 'primary' : 'ghost'}
          size="md"
          onClick={() => onPeriodChange(opt.key)}
        >
          {opt.label}
        </Button>
      ))}
      <Button
        variant={period === 'personalizado' ? 'primary' : 'ghost'}
        size="md"
        onClick={() => onPeriodChange('personalizado')}
      >
        Personalizado
      </Button>
      {period === 'personalizado' && (
        <>
          <Input label="De" type="date" value={customFrom} onChange={(e) => onCustomFromChange(e.target.value)} className="w-40" />
          <Input label="Até" type="date" value={customTo} onChange={(e) => onCustomToChange(e.target.value)} className="w-40" />
          <Button variant="secondary" size="md" onClick={onApplyCustom} disabled={!customFrom || !customTo}>
            Aplicar
          </Button>
        </>
      )}
    </div>
  );
}
