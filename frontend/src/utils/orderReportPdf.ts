import { formatMoney, toCents } from './money';
import { getOrderLabel } from './orderLabel';
import { computeKpis } from './kpis';
import type { Order } from '../types';

// jsPDF renderiza o NBSP do Intl de forma inconsistente; normaliza pra espaco comum.
const NBSP = String.fromCharCode(160);
const money = (cents: number) => formatMoney(cents).split(NBSP).join(' ');

interface Period {
  label: string;
  from: Date;
  to: Date;
}

// Rótulo de "Personalizado" tem barras e espaços (ex: "01/07/2026 a
// 19/07/2026") -- não dá pra usar direto num nome de arquivo.
const sanitizeFilenamePart = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');

// Estimativa de páginas do PDF completo (pedido a pedido), espelhando o
// espaçamento real usado abaixo (6mm por linha, primeira página começa em
// y=101, demais em y=20, ambas até y=285) -- usada pelo ExportPdfButton pra
// avisar o usuário antes de gerar um relatório grande.
export function estimateOrderReportPages(orderCount: number): number {
  const FIRST_PAGE_ROWS = Math.floor((285 - 101) / 6) + 1;
  const OTHER_PAGE_ROWS = Math.floor((285 - 20) / 6) + 1;
  if (orderCount <= FIRST_PAGE_ROWS) return 1;
  return 1 + Math.ceil((orderCount - FIRST_PAGE_ROWS) / OTHER_PAGE_ROWS);
}

// Gera o relatorio PDF do periodo. jsPDF entra por import dinamico -> vira um
// chunk separado, so baixado quando o botao e clicado (nunca no bundle publico
// nem no chunk do admin ate o clique).
export async function generateOrderReportPdf(orders: Order[], period: Period): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const kpis = computeKpis(orders);

  // Cabecalho
  doc.setFillColor(255, 107, 0);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text("SISTEMA DE PEDIDOS TRAILER - RELATORIO", 14, 14);

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Periodo: ${period.label} (${period.from.toLocaleDateString('pt-BR')} - ${period.to.toLocaleDateString('pt-BR')})`, 14, 30);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 35);
  doc.line(14, 39, 196, 39);

  // Metricas do periodo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('METRICAS DO PERIODO', 14, 47);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Faturamento Bruto: ${money(kpis.faturamentoCents)}`, 18, 54);
  doc.text(`Pedidos Entregues: ${kpis.deliveredCount}`, 18, 60);
  doc.text(`Ticket Medio: ${money(kpis.ticketMedioCents)}`, 18, 66);
  doc.text(`Cancelamentos: ${kpis.cancelledCount}`, 18, 72);
  doc.line(14, 77, 196, 77);

  // Lista resumida dos pedidos do periodo
  doc.setFont('helvetica', 'bold');
  doc.text('PEDIDOS DO PERIODO', 14, 85);
  doc.setFillColor(40, 40, 40);
  doc.setTextColor(255, 255, 255);
  doc.rect(14, 89, 182, 7, 'F');
  doc.setFontSize(8);
  doc.text('No', 16, 93.5);
  doc.text('IDENTIFICACAO', 32, 93.5);
  doc.text('TIPO', 110, 93.5);
  doc.text('STATUS', 138, 93.5);
  doc.text('TOTAL', 178, 93.5);

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  let y = 101;
  for (const o of orders) {
    if (y > 285) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(o.id).padStart(4, '0'), 16, y);
    doc.text(getOrderLabel(o).substring(0, 40), 32, y);
    doc.text(o.type, 110, y);
    doc.text(o.status, 138, y);
    doc.text(money(toCents(o.total)), 178, y);
    y += 6;
  }
  if (orders.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text('Nenhum pedido no periodo.', 16, y);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`pedidos_relatorio_${sanitizeFilenamePart(period.label)}_${stamp}.pdf`);
}
