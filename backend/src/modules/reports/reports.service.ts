import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { toCents } from '../../utils/money';
import type { SummaryQuery } from './reports.schema';

export interface ReportsSummary {
  faturamentoCents: number;
  deliveredCount: number;
  ticketMedioCents: number;
  cancelledCount: number;
  series: Array<{
    bucket: string;
    faturamentoCents: number;
    deliveredCount: number;
    cancelledCount: number;
  }>;
  topItems: Array<{ menuItemId: number; name: string; quantity: number }>;
  // Recortes do painel (Fase de relatório em Excel). Todos contam APENAS
  // pedidos ENTREGUE, igual ao faturamento -- misturar cancelado aqui faria a
  // soma das fatias não bater com o KPI de cima, que é o jeito mais rápido de
  // um relatório perder a confiança de quem lê.
  byType: Array<{ key: string; deliveredCount: number; faturamentoCents: number }>;
  byPayment: Array<{ key: string; deliveredCount: number; faturamentoCents: number }>;
  byNeighborhood: Array<{ key: string; deliveredCount: number; faturamentoCents: number }>;
  // Hora do relógio de Brasília (0-23), só as horas com movimento.
  byHour: Array<{ hour: number; deliveredCount: number; faturamentoCents: number }>;
}

interface SeriesRow {
  bucket: Date;
  faturamento: Prisma.Decimal | string | number | null;
  delivered_count: number;
  cancelled_count: number;
}

// Regras de período do expediente (America/Sao_Paulo). O trailer funciona atravessando
// a meia-noite, então todo corte de relatório -- dia, mês ou ano -- tem que cair na
// mesma fronteira de turno (12:00), nunca no meio de um turno ativo:
//
// 1. Dia comercial começa às 12:00. Um pedido às 01:30 pertence ao turno que
//    começou no dia anterior às 12:00 -- é a mesma regra de `getShiftRange()`.
// 2. Mês comercial começa no dia 1 às 12:00. Sem isso, os primeiros pedidos da
//    madrugada do dia 1 (ainda parte do turno da virada do mês anterior) seriam
//    contados no mês errado.
// 3. Ano comercial começa em 1º de janeiro às 12:00 -- é o caso particular da
//    regra 2 aplicada a janeiro, então não precisa de tratamento separado: o
//    truque de truncamento abaixo já resolve a virada de ano de graça.
//
// (A "semana comercial" começando na terça-feira às 12:00 segue o mesmo princípio
// -- o corte tem que cair numa fronteira de turno --, mas nenhuma granularidade
// deste endpoint agrupa por semana, então não há código de truncamento para ela
// aqui; a regra fica documentada para quando o front-end precisar montar esse
// período.)
//
// Truque de truncamento: subtrair 12h antes de truncar para a unidade (hour/day/month)
// e somar as 12h de volta desloca a fronteira de truncamento do Postgres (sempre à
// meia-noite) para o meio-dia. Para 'hour' a subtração/soma de 12h (múltiplo exato de
// 1h) não muda nada -- por isso a mesma expressão SQL serve para as três granularidades
// sem precisar de `CASE`.
//
// `created_at` é `timestamp without time zone` e a sessão do Postgres roda em UTC
// (`current_setting('TIMEZONE')` = 'Etc/UTC'): o valor gravado é o instante real
// expresso em dígitos de UTC, sem qualquer conversão pra fuso local. Truncar esse
// valor direto faria "meio-dia" cair às 9h da manhã em Brasília (meio-dia UTC =
// 9h BRT), não ao meio-dia comercial. Por isso o valor precisa ser reexpresso em
// America/Sao_Paulo (via o dance `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'`
// -- primeiro recupera o instante absoluto assumindo que o naive é UTC, depois
// converte esse instante pro relógio de parede de Brasília) antes de aplicar o
// truque de truncamento. O resultado final é reconvertido pra instante absoluto
// (`AT TIME ZONE 'America/Sao_Paulo'` de novo, desta vez sobre um naive já em
// horário de Brasília) pra que o bucket devolvido ao cliente seja um timestamp
// real, não um horário de parede sem fuso.
async function getSeries(from: Date, to: Date, granularity: SummaryQuery['granularity']) {
  const rows = await prisma.$queryRaw<SeriesRow[]>(
    Prisma.sql`
      SELECT
        (
          date_trunc(
            ${granularity},
            (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') - interval '12 hours'
          ) + interval '12 hours'
        ) AT TIME ZONE 'America/Sao_Paulo' AS bucket,
        COALESCE(SUM("total") FILTER (WHERE status = 'ENTREGUE'), 0) AS faturamento,
        COUNT(*) FILTER (WHERE status = 'ENTREGUE')::int AS delivered_count,
        COUNT(*) FILTER (WHERE status = 'CANCELADO')::int AS cancelled_count
      FROM "orders"
      WHERE "created_at" >= ${from} AND "created_at" <= ${to}
      GROUP BY 1
      ORDER BY 1
    `
  );

  return rows.map((row) => ({
    bucket: row.bucket.toISOString(),
    faturamentoCents: toCents(row.faturamento),
    deliveredCount: row.delivered_count,
    cancelledCount: row.cancelled_count,
  }));
}

async function getTopItems(from: Date, to: Date) {
  const grouped = await prisma.orderItem.groupBy({
    by: ['menuItemId', 'menuItemName'],
    where: {
      order: { status: 'ENTREGUE', createdAt: { gte: from, lte: to } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  });

  return grouped.map((item) => ({
    menuItemId: item.menuItemId,
    name: item.menuItemName,
    quantity: item._sum.quantity ?? 0,
  }));
}

interface BreakdownRow {
  key: string | null;
  faturamento: Prisma.Decimal | string | number | null;
  delivered_count: number;
}

const DELIVERED_IN_RANGE = (from: Date, to: Date) => ({
  status: 'ENTREGUE' as const,
  createdAt: { gte: from, lte: to },
});

// groupBy do Prisma em vez de SQL cru: é agregação simples por coluna, sem
// nada de fuso envolvido (diferente da série temporal, que precisa do truque
// de truncamento às 12:00).
async function getByColumn(
  from: Date,
  to: Date,
  column: 'type' | 'paymentMethod',
): Promise<ReportsSummary['byType']> {
  const rows = await prisma.order.groupBy({
    by: [column],
    where: DELIVERED_IN_RANGE(from, to),
    _sum: { total: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({
      key: String(r[column]),
      deliveredCount: r._count._all,
      faturamentoCents: toCents(r._sum.total),
    }))
    .sort((a, b) => b.faturamentoCents - a.faturamentoCents);
}

// Bairro vem do SNAPSHOT, nunca da tabela de bairros: o pedido tem que
// continuar contando no bairro em que foi feito mesmo que o bairro seja
// renomeado ou desativado depois (mesma razão de deliveryFeeSnapshot).
async function getByNeighborhood(from: Date, to: Date): Promise<ReportsSummary['byNeighborhood']> {
  const rows = await prisma.order.groupBy({
    by: ['neighborhoodNameSnapshot'],
    where: { ...DELIVERED_IN_RANGE(from, to), type: 'DELIVERY' },
    _sum: { total: true },
    _count: { _all: true },
  });
  return rows
    .filter((r) => r.neighborhoodNameSnapshot !== null)
    .map((r) => ({
      key: r.neighborhoodNameSnapshot as string,
      deliveredCount: r._count._all,
      faturamentoCents: toCents(r._sum.total),
    }))
    .sort((a, b) => b.faturamentoCents - a.faturamentoCents)
    .slice(0, 10);
}

// Movimento por hora da noite. Aqui o fuso IMPORTA: created_at é naive em
// dígitos de UTC (ver nota extensa de getSeries), então extrair a hora direto
// devolveria 3h da manhã para um pedido da meia-noite. O mesmo dance de
// AT TIME ZONE usado na série resolve.
async function getByHour(from: Date, to: Date): Promise<ReportsSummary['byHour']> {
  const rows = await prisma.$queryRaw<Array<{ hour: number } & Omit<BreakdownRow, 'key'>>>(
    Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS hour,
        COALESCE(SUM("total"), 0) AS faturamento,
        COUNT(*)::int AS delivered_count
      FROM "orders"
      WHERE status = 'ENTREGUE' AND "created_at" >= ${from} AND "created_at" <= ${to}
      GROUP BY 1
      ORDER BY 1
    `
  );
  return rows.map((r) => ({
    hour: r.hour,
    deliveredCount: r.delivered_count,
    faturamentoCents: toCents(r.faturamento),
  }));
}

export const reportsService = {
  async getSummary({ from, to, granularity }: SummaryQuery): Promise<ReportsSummary> {
    const [deliveredAgg, cancelledCount, series, topItems, byType, byPayment, byNeighborhood, byHour] = await Promise.all([
      prisma.order.aggregate({
        where: { status: 'ENTREGUE', createdAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.count({
        where: { status: 'CANCELADO', createdAt: { gte: from, lte: to } },
      }),
      getSeries(from, to, granularity),
      getTopItems(from, to),
      getByColumn(from, to, 'type'),
      getByColumn(from, to, 'paymentMethod'),
      getByNeighborhood(from, to),
      getByHour(from, to),
    ]);

    const faturamentoCents = toCents(deliveredAgg._sum.total);
    const deliveredCount = deliveredAgg._count;
    const ticketMedioCents = deliveredCount > 0 ? Math.round(faturamentoCents / deliveredCount) : 0;

    return {
      faturamentoCents,
      deliveredCount,
      ticketMedioCents,
      cancelledCount,
      series,
      topItems,
      byType,
      byPayment,
      byNeighborhood,
      byHour,
    };
  },
};
