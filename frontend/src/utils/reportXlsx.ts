import { toCents } from './money';
import {
  buildXlsx, downloadXlsx, columnLetter, BRAND,
  type CellValue, type ChartSpec, type XlsxSheet,
} from './xlsxWriter';
import type { Order, ReportsSummary } from '../types';

interface Period {
  label: string;
  from: Date;
  to: Date;
}

const sanitizeFilenamePart = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const stamp = () => new Date().toISOString().slice(0, 10);

// Dinheiro vive em centavos no frontend inteiro (regra do projeto: nunca
// float em caminho de dinheiro). Só vira reais aqui, na borda, e como NÚMERO
// com formato -- planilha com dinheiro em texto não soma nem entra em gráfico.
const money = (cents: number): CellValue => ({ t: 'money', v: cents / 100 });
const int = (n: number): CellValue => ({ t: 'int', v: n });
const dt = (iso: string): CellValue => ({ t: 'datetime', v: new Date(iso) });

const STATUS_PT: Record<string, string> = {
  AGUARDANDO: 'Aguardando', PREPARANDO: 'Preparando', PRONTO: 'Pronto',
  EM_ROTA: 'Em rota', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
const TYPE_PT: Record<string, string> = { MESA: 'Mesa', RETIRADA: 'Retirada', DELIVERY: 'Delivery' };
const PAYMENT_PT: Record<string, string> = { DINHEIRO: 'Dinheiro', PIX: 'Pix', CREDITO: 'Crédito', DEBITO: 'Débito' };

// ===========================================================================
// MODO COMPLETO -- despejo bruto, uma linha por registro, zero agregação.
//
// Três abas espelhando as três tabelas do banco (orders, order_items,
// order_item_extras), ligadas pelo número do pedido. Nenhuma célula esconde
// informação dentro de texto concatenado, e nenhum gráfico: aqui o objetivo é
// conferir e cruzar, não apresentar.
//
// As poucas colunas calculadas (troco, total da linha, contagens) ficam no
// fim de cada aba, marcadas no cabeçalho. Elas acrescentam, nunca substituem.
// ===========================================================================

// Fórmula oficial do projeto (CONTEXTO 5.1): acréscimo multiplica pela
// quantidade do item. "2x X-Burguer com bacon" cobra dois bacons.
function lineTotalCents(item: Order['items'][number]): number {
  const extras = item.extras.reduce((sum, e) => sum + toCents(e.unitPrice) * e.quantity, 0);
  return (toCents(item.unitPrice) + extras) * item.quantity;
}

function pedidosSheet(orders: Order[]): XlsxSheet {
  const header = [
    'Nº do pedido', 'Tipo', 'Status', 'Mesa', 'Cliente', 'Telefone', 'Endereço',
    'Bairro', 'ID do bairro', 'Taxa de entrega', 'Subtotal', 'Total',
    'Forma de pagamento', 'Pago em dinheiro', 'Troco (calculado)',
    'Lançado por', 'ID de quem lançou', 'Entregador', 'ID do entregador',
    'Pedido online', 'Aguarda confirmação', 'Ocorrência',
    'Criado em', 'Atualizado em', 'Qtd. de itens (calculado)',
  ];

  const rows: CellValue[][] = orders.map((o) => {
    const totalCents = toCents(o.total);
    const pagoCents = o.cashPaidAmount ? toCents(o.cashPaidAmount) : null;
    return [
      int(o.id),
      TYPE_PT[o.type] ?? o.type,
      STATUS_PT[o.status] ?? o.status,
      o.tableNumber !== null && o.tableNumber !== undefined ? int(o.tableNumber) : null,
      o.customerName ?? null,
      o.customerPhone ?? null,
      o.customerAddress ?? null,
      o.neighborhoodNameSnapshot ?? null,
      o.neighborhoodId !== null && o.neighborhoodId !== undefined ? int(o.neighborhoodId) : null,
      o.deliveryFeeSnapshot ? money(toCents(o.deliveryFeeSnapshot)) : null,
      money(toCents(o.subtotal)),
      money(totalCents),
      PAYMENT_PT[o.paymentMethod] ?? o.paymentMethod,
      pagoCents !== null ? money(pagoCents) : null,
      pagoCents !== null ? money(pagoCents - totalCents) : null,
      o.createdByName ?? null,
      o.createdById !== null && o.createdById !== undefined ? int(o.createdById) : null,
      o.assignedToName ?? null,
      o.assignedToId !== null && o.assignedToId !== undefined ? int(o.assignedToId) : null,
      o.clientOnline,
      o.requiresStaffConfirmation,
      o.problems ?? null,
      dt(o.createdAt),
      dt(o.updatedAt),
      int(o.items.length),
    ];
  });

  return {
    name: 'Pedidos',
    columnWidths: [13, 10, 12, 7, 24, 16, 38, 22, 11, 14, 12, 12, 17, 15, 15, 20, 15, 20, 15, 13, 18, 34, 18, 18, 18],
    rows: [header, ...rows],
  };
}

function itensSheet(orders: Order[]): XlsxSheet {
  const header = [
    'Nº do pedido', 'ID do item', 'ID do produto', 'Produto', 'Escolha obrigatória',
    'Quantidade', 'Preço unitário', 'Qtd. de acréscimos', 'Total da linha (calculado)',
    'Observações', 'Tipo do pedido', 'Status do pedido', 'Pedido criado em',
  ];

  const rows: CellValue[][] = orders.flatMap((o) =>
    o.items.map((item) => [
      int(o.id), int(item.id), int(item.menuItemId), item.menuItemName,
      item.selectedChoice ?? null, int(item.quantity), money(toCents(item.unitPrice)),
      int(item.extras.length), money(lineTotalCents(item)), item.observations ?? null,
      TYPE_PT[o.type] ?? o.type, STATUS_PT[o.status] ?? o.status, dt(o.createdAt),
    ]),
  );

  return {
    name: 'Itens do pedido',
    columnWidths: [13, 11, 13, 30, 20, 11, 14, 17, 22, 40, 13, 14, 18],
    rows: [header, ...rows],
  };
}

function acrescimosSheet(orders: Order[]): XlsxSheet {
  const header = [
    'Nº do pedido', 'ID do item', 'Produto do item', 'ID do acréscimo', 'ID do produto',
    'Acréscimo', 'Qtd. do acréscimo', 'Qtd. do item', 'Preço unitário',
    'Total no pedido (calculado)', 'Pedido criado em',
  ];

  const rows: CellValue[][] = orders.flatMap((o) =>
    o.items.flatMap((item) =>
      item.extras.map((extra) => [
        int(o.id), int(item.id), item.menuItemName, int(extra.id), int(extra.menuItemId),
        extra.menuItemName, int(extra.quantity), int(item.quantity),
        money(toCents(extra.unitPrice)),
        money(toCents(extra.unitPrice) * extra.quantity * item.quantity),
        dt(o.createdAt),
      ]),
    ),
  );

  return {
    name: 'Acréscimos',
    columnWidths: [13, 11, 30, 15, 13, 24, 17, 13, 14, 24, 18],
    rows: [header, ...rows],
  };
}

export async function generateOrderReportXlsx(orders: Order[], period: Period): Promise<void> {
  const bytes = await buildXlsx([pedidosSheet(orders), itensSheet(orders), acrescimosSheet(orders)]);
  downloadXlsx(bytes, `pedidos_${sanitizeFilenamePart(period.label)}_${stamp()}.xlsx`);
}

// ===========================================================================
// MODO RESUMO -- painel. Só agregados de /reports/summary, sem pedido
// individual, então funciona pra qualquer período sem limite de tamanho.
//
// As métricas são as do trailer, não as de um CRM de vendas: não existe meta
// nem funil de conversão neste sistema, e inventar um seria fabricar dado de
// negócio. O que existe e importa numa noite de trailer é movimento por hora,
// mix entre mesa/retirada/delivery, formas de pagamento e bairros.
// ===========================================================================

const DADOS = 'Dados do painel';
const ref = (col: number, from: number, to: number) =>
  `'${DADOS}'!$${columnLetter(col)}$${from}:$${columnLetter(col)}$${to}`;

// Cores das fatias, na ordem da marca. Cicla se houver mais fatias que cores.
const SLICE = [BRAND.brasa, BRAND.mostarda, BRAND.grafite, BRAND.farol, 'FF7E7E8B', 'FFA5A5B5'];
const slices = (n: number) => Array.from({ length: n }, (_, i) => SLICE[i % SLICE.length]);

interface Bloco {
  col: number;              // coluna inicial (0-based)
  header: string[];
  rows: CellValue[][];
}

// Monta a aba de dados colocando os blocos lado a lado, cada um começando na
// sua coluna. Os gráficos apontam pra estes intervalos, então as posições
// precisam ser calculadas aqui e em lugar nenhum mais.
function montarDados(blocos: Bloco[]): CellValue[][] {
  const altura = Math.max(...blocos.map((b) => b.rows.length)) + 1;
  const largura = Math.max(...blocos.map((b) => b.col + b.header.length));
  const grid: CellValue[][] = Array.from({ length: altura }, () =>
    Array.from({ length: largura }, () => null as CellValue));

  for (const bloco of blocos) {
    bloco.header.forEach((h, i) => { grid[0][bloco.col + i] = { t: 'header', v: h }; });
    bloco.rows.forEach((row, r) => {
      row.forEach((cell, i) => { grid[r + 1][bloco.col + i] = cell; });
    });
  }
  return grid;
}

export async function generateSummaryReportXlsx(summary: ReportsSummary, period: Period): Promise<void> {
  const fechados = summary.deliveredCount + summary.cancelledCount;
  const taxaCancelamento = fechados > 0 ? summary.cancelledCount / fechados : 0;

  // --- aba de dados: cada bloco numa faixa de colunas conhecida ------------
  const blocos: Bloco[] = [
    {
      col: 0, header: ['Data', 'Faturamento', 'Pedidos entregues', 'Pedidos cancelados'],
      rows: summary.series.map((p) => [
        { t: 'date' as const, v: new Date(p.bucket) },
        money(p.faturamentoCents), int(p.deliveredCount), int(p.cancelledCount),
      ]),
    },
    {
      col: 5, header: ['Tipo de pedido', 'Faturamento', 'Pedidos'],
      rows: summary.byType.map((b) => [TYPE_PT[b.key] ?? b.key, money(b.faturamentoCents), int(b.deliveredCount)]),
    },
    {
      col: 9, header: ['Forma de pagamento', 'Faturamento', 'Pedidos'],
      rows: summary.byPayment.map((b) => [PAYMENT_PT[b.key] ?? b.key, money(b.faturamentoCents), int(b.deliveredCount)]),
    },
    {
      col: 13, header: ['Item', 'Quantidade vendida'],
      rows: summary.topItems.map((i) => [i.name, int(i.quantity)]),
    },
    {
      col: 16, header: ['Bairro', 'Faturamento', 'Entregas'],
      rows: summary.byNeighborhood.map((b) => [b.key, money(b.faturamentoCents), int(b.deliveredCount)]),
    },
    {
      col: 20, header: ['Hora', 'Faturamento', 'Pedidos'],
      rows: summary.byHour.map((h) => [`${String(h.hour).padStart(2, '0')}h`, money(h.faturamentoCents), int(h.deliveredCount)]),
    },
  ];

  const abaDados: XlsxSheet = {
    name: DADOS,
    columnWidths: [13, 15, 18, 19, 3, 18, 15, 11, 3, 20, 15, 11, 3, 30, 19, 3, 22, 15, 11, 3, 8, 15, 11],
    rows: montarDados(blocos),
  };

  // Última linha de cada bloco (1-based, +1 por causa do cabeçalho).
  const fim = (b: Bloco) => b.rows.length + 1;
  const [bDia, bTipo, bPag, bItens, bBairro, bHora] = blocos;

  // --- painel --------------------------------------------------------------
  const charts: ChartSpec[] = [];
  const box = (col: number, row: number): ChartSpec['anchor'] =>
    ({ fromCol: col, fromRow: row, toCol: col + 4, toRow: row + 16 });

  if (bDia.rows.length > 0) {
    charts.push({
      kind: 'col', title: 'Faturamento e pedidos por dia', moneyAxis: true,
      categoriesRef: ref(0, 2, fim(bDia)),
      series: [
        { name: 'Faturamento', valuesRef: ref(1, 2, fim(bDia)), colorARGB: BRAND.brasa },
        { name: 'Pedidos entregues', valuesRef: ref(2, 2, fim(bDia)), asLine: true, colorARGB: BRAND.grafite },
      ],
      anchor: box(0, 8),
    });
  }
  if (bHora.rows.length > 0) {
    charts.push({
      kind: 'col', title: 'Movimento por hora da noite', moneyAxis: true,
      categoriesRef: ref(20, 2, fim(bHora)),
      series: [{ name: 'Faturamento', valuesRef: ref(21, 2, fim(bHora)), colorARGB: BRAND.brasa }],
      anchor: box(5, 8), legend: false,
    });
  }
  if (bTipo.rows.length > 0) {
    charts.push({
      kind: 'doughnut', title: 'Faturamento por tipo de pedido',
      categoriesRef: ref(5, 2, fim(bTipo)),
      series: [{ name: 'Faturamento', valuesRef: ref(6, 2, fim(bTipo)) }],
      sliceColors: slices(bTipo.rows.length),
      anchor: box(0, 25),
    });
  }
  if (bPag.rows.length > 0) {
    charts.push({
      kind: 'doughnut', title: 'Faturamento por forma de pagamento',
      categoriesRef: ref(9, 2, fim(bPag)),
      series: [{ name: 'Faturamento', valuesRef: ref(10, 2, fim(bPag)) }],
      sliceColors: slices(bPag.rows.length),
      anchor: box(5, 25),
    });
  }
  if (bItens.rows.length > 0) {
    charts.push({
      kind: 'bar', title: 'Itens mais vendidos',
      categoriesRef: ref(13, 2, fim(bItens)),
      series: [{ name: 'Quantidade', valuesRef: ref(14, 2, fim(bItens)), colorARGB: BRAND.mostarda }],
      anchor: box(0, 42), legend: false,
    });
  }
  if (bBairro.rows.length > 0) {
    charts.push({
      // Vermelho-farol é a cor do entregador no sistema (ESTILO.md seção 4);
      // aqui marca justamente o recorte que só existe pra delivery.
      kind: 'bar', title: 'Faturamento por bairro (delivery)', moneyAxis: true,
      categoriesRef: ref(16, 2, fim(bBairro)),
      series: [{ name: 'Faturamento', valuesRef: ref(17, 2, fim(bBairro)), colorARGB: BRAND.farol }],
      anchor: box(5, 42), legend: false,
    });
  }

  const vazio: CellValue[] = [];
  const painel: XlsxSheet = {
    name: 'Painel',
    headerRow: false,
    hideGridlines: true,
    columnWidths: [18, 18, 18, 18, 4, 18, 18, 18, 18],
    rowHeights: { 0: 26, 3: 18, 4: 30, 5: 12 },
    merges: [
      'A1:I1', 'A2:I2',
      'A4:B4', 'C4:D4', 'F4:G4', 'H4:I4',
      'A5:B6', 'C5:D6', 'F5:G6', 'H5:I6',
    ],
    rows: [
      [{ t: 'title', v: "Sistema de Pedidos Trailer — Painel de vendas" }],
      [{ t: 'subtitle', v: `${period.label}  ·  ${period.from.toLocaleDateString('pt-BR')} a ${period.to.toLocaleDateString('pt-BR')}  ·  gerado em ${new Date().toLocaleString('pt-BR')}` }],
      vazio,
      [
        { t: 'card', v: 'FATURAMENTO', color: 'brasa' }, null,
        { t: 'card', v: 'PEDIDOS ENTREGUES', color: 'grafite' }, null, null,
        { t: 'card', v: 'TICKET MÉDIO', color: 'mostarda' }, null,
        { t: 'card', v: 'CANCELAMENTOS', color: 'farol' },
      ],
      [
        { t: 'cardValue', v: summary.faturamentoCents / 100, color: 'brasa', fmt: 'money' }, null,
        { t: 'cardValue', v: summary.deliveredCount, color: 'grafite', fmt: 'int' }, null, null,
        { t: 'cardValue', v: summary.ticketMedioCents / 100, color: 'mostarda', fmt: 'money' }, null,
        { t: 'cardValue', v: taxaCancelamento, color: 'farol', fmt: 'percent' },
      ],
      vazio,
      [{ t: 'subtitle', v: 'Faturamento, ticket médio e todos os gráficos contam apenas pedidos com status Entregue. Cancelamentos mostra a fatia dos pedidos fechados que foi cancelada.' }],
      [{ t: 'subtitle', v: 'O dia começa às 12:00 e termina às 11:59 do dia seguinte, porque o expediente atravessa a meia-noite. Para a lista pedido a pedido, use a exportação Completo.' }],
    ],
    charts,
  };

  const bytes = await buildXlsx([painel, abaDados]);
  downloadXlsx(bytes, `painel_${sanitizeFilenamePart(period.label)}_${stamp()}.xlsx`);
}
