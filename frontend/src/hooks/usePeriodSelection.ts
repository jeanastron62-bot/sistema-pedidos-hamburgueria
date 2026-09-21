import { useState } from 'react';
import { useShiftRange } from './useShiftRange';
import { getPeriodRange, getCustomRange, type PeriodKey, type DateRange } from '../utils/periods';

export type PeriodSelection = PeriodKey | 'personalizado';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
};

function formatBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// Estado do seletor de período compartilhado por PanelADM e PanelTI -- os dois
// painéis mostram o mesmo dashboard, então a lógica de período vive uma vez só
// aqui em vez de duplicada nos dois arquivos.
export function usePeriodSelection() {
  const { range: shiftRange, error: rangeError } = useShiftRange();
  const [period, setPeriod] = useState<PeriodSelection>('hoje');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  const range: DateRange | null =
    period === 'personalizado' ? customRange : shiftRange ? getPeriodRange(period, shiftRange) : null;

  const periodLabel =
    period === 'personalizado'
      ? customFrom && customTo
        ? `${formatBR(customFrom)} a ${formatBR(customTo)}`
        : 'Personalizado'
      : PERIOD_LABELS[period];

  const applyCustomRange = () => {
    if (customFrom && customTo) setCustomRange(getCustomRange(customFrom, customTo));
  };

  return {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    applyCustomRange,
    range,
    periodLabel,
    rangeError,
  };
}
