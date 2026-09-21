import { formatMoney } from './money';
import type { ReportsSummary } from '../types';

// jsPDF renderiza o NBSP do Intl de forma inconsistente; normaliza pra espaco comum.
const NBSP = String.fromCharCode(160);
const money = (cents: number) => formatMoney(cents).split(NBSP).join(' ');
const sanitizeFilenamePart = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');

interface Period {
  label: string;
  from: Date;
  to: Date;
}

// Bucket vem em ISO/UTC do backend -- exibe em horario de Brasilia, igual ao
// RevenueChart, pra nao expor UTC bruto no relatorio que sai pro cliente.
function formatBucketDate(bucket: string): string {
  return new Date(bucket).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const PAGE_BOTTOM = 285;

function addPageIfNeeded(doc: import('jspdf').jsPDF, y: number): number {
  if (y > PAGE_BOTTOM) {
    doc.addPage();
    return 20;
  }
  return y;
}

// Modo "Resumo": só os agregados de /reports/summary (KPIs + serie + top 10).
// Nunca busca pedido individual -- ao contrario de generateOrderReportPdf,
// funciona pra qualquer periodo sem limite de tamanho.
export async function generateSummaryReportPdf(summary: ReportsSummary, period: Period): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();

  doc.setFillColor(255, 107, 0);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text("SISTEMA DE PEDIDOS TRAILER - RELATORIO (RESUMO)", 14, 14);

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Periodo: ${period.label} (${period.from.toLocaleDateString('pt-BR')} - ${period.to.toLocaleDateString('pt-BR')})`, 14, 30);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 35);
  doc.line(14, 39, 196, 39);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('METRICAS DO PERIODO', 14, 47);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Faturamento Bruto: ${money(summary.faturamentoCents)}`, 18, 54);
  doc.text(`Pedidos Entregues: ${summary.deliveredCount}`, 18, 60);
  doc.text(`Ticket Medio: ${money(summary.ticketMedioCents)}`, 18, 66);
  doc.text(`Cancelamentos: ${summary.cancelledCount}`, 18, 72);
  doc.line(14, 77, 196, 77);

  let y = 85;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SERIE TEMPORAL', 14, y);
  y += 8;
  doc.setFillColor(40, 40, 40);
  doc.setTextColor(255, 255, 255);
  doc.rect(14, y - 4, 182, 7, 'F');
  doc.setFontSize(8);
  doc.text('PERIODO', 16, y);
  doc.text('FATURAMENTO', 90, y);
  doc.text('ENTREGUES', 140, y);
  doc.text('CANCELADOS', 170, y);
  y += 8;

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  if (summary.series.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text('Nenhum dado no periodo.', 16, y);
    y += 6;
  }
  for (const point of summary.series) {
    y = addPageIfNeeded(doc, y);
    doc.setTextColor(40, 40, 40);
    doc.text(formatBucketDate(point.bucket), 16, y);
    doc.text(money(point.faturamentoCents), 90, y);
    doc.text(String(point.deliveredCount), 140, y);
    doc.text(String(point.cancelledCount), 170, y);
    y += 6;
  }

  y = addPageIfNeeded(doc, y + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOP 10 ITENS MAIS VENDIDOS', 14, y);
  y += 8;
  doc.setFillColor(40, 40, 40);
  doc.setTextColor(255, 255, 255);
  doc.rect(14, y - 4, 182, 7, 'F');
  doc.setFontSize(8);
  doc.text('No', 16, y);
  doc.text('ITEM', 26, y);
  doc.text('QUANTIDADE', 170, y);
  y += 8;

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  if (summary.topItems.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text('Nenhum item vendido no periodo.', 16, y);
  }
  summary.topItems.forEach((item, idx) => {
    y = addPageIfNeeded(doc, y);
    doc.setTextColor(40, 40, 40);
    doc.text(String(idx + 1), 16, y);
    doc.text(item.name.substring(0, 50), 26, y);
    doc.text(String(item.quantity), 170, y);
    y += 6;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`pedidos_relatorio_resumo_${sanitizeFilenamePart(period.label)}_${stamp}.pdf`);
}
