export type PeriodKey = 'hoje' | 'ontem' | 'semana' | 'mes' | 'ano';
export type Granularity = 'hour' | 'day' | 'month';

export interface DateRange {
  from: Date;
  to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Extrai dia/mês/ano/dia-da-semana de um instante no fuso America/Sao_Paulo --
// nunca usa Date.getDate()/getDay() do navegador, que leem o fuso do sistema
// operacional do usuário (pode não ser o do Brasil), não o do negócio.
function brasiliaFields(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), weekday: map.weekday };
}

// Regras de período comercial (America/Sao_Paulo) -- mesmas três documentadas
// no comentário de reports.service.ts no backend, para as duas implementações
// nunca divergirem sobre onde cai a fronteira:
//
// 1. Semana comercial começa na terça-feira às 12:00.
// 2. Mês comercial começa no dia 1 às 12:00 -- pedidos do dia 1 entre 00:00 e
//    11:59 pertencem ao mês anterior.
// 3. Ano comercial começa em 1º de janeiro às 12:00 -- caso particular da
//    regra 2 aplicada a janeiro.
//
// `shiftRange` é o turno de HOJE, já resolvido pelo backend (GET
// /config/shift-range -> getShiftRange()): a âncora já cai exatamente às
// 12:00 de Brasília do dia comercial correto (o backend já decidiu se "agora"
// pertence ao turno de hoje ou de ontem). A partir dela, cada passo de um dia
// inteiro pra trás é sempre exatamente 24h em instante absoluto --
// America/Sao_Paulo não tem horário de verão desde 2019, então não existe
// hora dupla/faltando pra desalinhar do meio-dia.
export function getPeriodRange(period: PeriodKey, shiftRange: DateRange): DateRange {
  if (period === 'hoje') return shiftRange;

  if (period === 'ontem') {
    return {
      from: new Date(shiftRange.from.getTime() - DAY_MS),
      to: new Date(shiftRange.to.getTime() - DAY_MS),
    };
  }

  const { year, month, day, weekday } = brasiliaFields(shiftRange.from);

  if (period === 'semana') {
    const daysSinceTuesday = (WEEKDAY_INDEX[weekday] - WEEKDAY_INDEX.Tue + 7) % 7;
    return { from: new Date(shiftRange.from.getTime() - daysSinceTuesday * DAY_MS), to: shiftRange.to };
  }

  if (period === 'mes') {
    const daysSinceFirst = day - 1;
    return { from: new Date(shiftRange.from.getTime() - daysSinceFirst * DAY_MS), to: shiftRange.to };
  }

  // ano -- diferença de dias até 1º de janeiro calculada com Date.UTC só como
  // aritmética de calendário (Y/M/D abstratos), não como instante real.
  const daysSinceJan1 = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / DAY_MS);
  return { from: new Date(shiftRange.from.getTime() - daysSinceJan1 * DAY_MS), to: shiftRange.to };
}

// Período "Personalizado": duas datas de calendário puras (<input type="date">,
// sem horário). America/Sao_Paulo é fixo UTC-3 (sem horário de verão desde
// 2019), então o offset explícito abaixo é exato e independente do fuso do
// sistema operacional do navegador.
// ponytail: se o Brasil reinstituir horário de verão, isso quebra -- trocar
// por uma lib com banco de fusos IANA (date-fns-tz, Luxon) nesse caso.
export function getCustomRange(fromDateStr: string, toDateStr: string): DateRange {
  return {
    from: new Date(`${fromDateStr}T00:00:00.000-03:00`),
    to: new Date(`${toDateStr}T23:59:59.999-03:00`),
  };
}

// RevenueChart usa isso pra escolher o tamanho do balde da série temporal
// conforme o período -- períodos curtos (hoje/ontem) mostram detalhe por
// hora, períodos longos (ano) resumem por mês, senão a série teria baldes
// demais pra caber no gráfico.
export function getGranularityForPeriod(period: PeriodKey): Granularity {
  if (period === 'hoje' || period === 'ontem') return 'hour';
  if (period === 'semana' || period === 'mes') return 'day';
  return 'month';
}
