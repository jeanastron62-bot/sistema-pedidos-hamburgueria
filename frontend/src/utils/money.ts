export function toCents(value: string | number): number {
  const str = typeof value === 'number' ? value.toFixed(2) : value;
  const negative = str.trim().startsWith('-');
  const clean = str.replace('-', '');
  const [whole, fraction = '00'] = clean.split('.');
  const cents = parseInt(whole || '0', 10) * 100 + parseInt((fraction + '00').slice(0, 2), 10);
  return negative ? -cents : cents;
}

export function formatMoney(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatMoneyFromString(value: string): string {
  return formatMoney(toCents(value));
}
