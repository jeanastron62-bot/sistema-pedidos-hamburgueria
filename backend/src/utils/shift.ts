// `new Date('YYYY-MM-DD')` (sem horário) é sempre interpretado como meia-noite
// UTC pelo JavaScript, mesmo com TZ=America/Sao_Paulo configurado -- só formas
// com horário (sem 'Z'/offset) são interpretadas no fuso local do processo.
// Usado para filtros de período (?from=&to=) vindos de <input type="date">,
// que mandam só a data. Sem isso, o filtro fica deslocado ~3h do dia real em
// Brasília, ou captura o dia errado perto da meia-noite.
export function parseLocalDayBoundary(dateStr: string, endOfDay: boolean): Date {
  const hasTime = /T\d{2}:\d{2}/.test(dateStr);
  if (hasTime) return new Date(dateStr);
  return new Date(`${dateStr}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
}

export function getShiftRange(): { from: Date; to: Date } {
  // O fuso TZ="America/Sao_Paulo" faz com que o 'new Date()' do NodeJS use o fuso correto localmente.
  // Expediente: 12:00 até 11:59 do dia seguinte.
  const now = new Date();
  
  let shiftStart = new Date(now);
  shiftStart.setHours(12, 0, 0, 0);

  // Se agora é antes de meio-dia, pertence ao expediente do dia anterior
  if (now.getHours() < 12) {
    shiftStart.setDate(shiftStart.getDate() - 1);
  }

  let shiftEnd = new Date(shiftStart);
  shiftEnd.setDate(shiftEnd.getDate() + 1);
  shiftEnd.setHours(11, 59, 59, 999);

  return { from: shiftStart, to: shiftEnd };
}
