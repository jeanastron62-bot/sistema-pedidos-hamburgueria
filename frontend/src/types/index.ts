export type Role = 'GARCOM' | 'CHAPISTA' | 'ENTREGADOR' | 'ADM' | 'TI';
export type Category = 'HOT_DOGS' | 'HAMBURGUERES' | 'MACARRAO_NA_CHAPA' | 'BEBIDAS' | 'ACRESCIMOS';
export type OrderType = 'MESA' | 'RETIRADA' | 'DELIVERY';
export type OrderStatus = 'AGUARDANDO' | 'PREPARANDO' | 'PRONTO' | 'EM_ROTA' | 'ENTREGUE' | 'CANCELADO';
export type PaymentMethod = 'DINHEIRO' | 'PIX' | 'CREDITO' | 'DEBITO';

export interface RequiredChoice {
  label: string;
  options: string[];
}

export interface MenuItem {
  id: number;
  name: string;
  category: Category;
  price: string;
  description: string | null;
  available: boolean;
  archived: boolean;
  ingredients: string[];
  requiredChoice: RequiredChoice | null;
}

export interface Neighborhood {
  id: number;
  name: string;
  deliveryFee: string;
  active: boolean;
}

export interface SystemConfig {
  trailerOpen: boolean;
  effectivelyOpen: boolean;
  scheduledCloseAt: string | null;
  deliveryActive: boolean;
  deliveryExtendedUntil: string | null;
  maxTables: number;
  contactPhone: string;
  contactInstagram: string;
  dailyNotice?: string | null;
  dailyNoticeUpdatedAt?: string | null;
  defaultCloseHour?: number;
  closeCeilingHour?: number;
  closedWeekday?: number | null;
}

export interface OrderItemExtra {
  id: number;
  menuItemId: number;
  menuItemName: string;
  unitPrice: string;
  quantity: number;
}

export interface OrderItem {
  id: number;
  menuItemId: number;
  menuItemName: string;
  unitPrice: string;
  quantity: number;
  observations: string | null;
  selectedChoice: string | null;
  extras: OrderItemExtra[];
}

export interface Order {
  id: number;
  type: OrderType;
  status: OrderStatus;
  tableNumber: number | null;
  subtotal: string;
  total: string;
  paymentMethod: PaymentMethod;
  cashPaidAmount: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  neighborhoodId: number | null;
  neighborhoodNameSnapshot: string | null;
  deliveryFeeSnapshot: string | null;
  createdById: number | null;
  createdByName: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  clientOnline: boolean;
  requiresStaffConfirmation: boolean;
  problems: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface User {
  id: number;
  username: string;
  role: Role;
  approved: boolean;
}

export interface Log {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  details: unknown;
  createdAt: string;
  user: { role: Role } | null;
}

export interface ReportsSeriesPoint {
  bucket: string;
  faturamentoCents: number;
  deliveredCount: number;
  cancelledCount: number;
}

export interface ReportsTopItem {
  menuItemId: number;
  name: string;
  quantity: number;
}

// Recortes do painel. Espelham reports.service.ts -- todos contam apenas
// pedidos ENTREGUE, pelo mesmo motivo do faturamento.
export interface ReportsBreakdown {
  key: string;
  deliveredCount: number;
  faturamentoCents: number;
}

export interface ReportsHourPoint {
  hour: number;
  deliveredCount: number;
  faturamentoCents: number;
}

export interface ReportsSummary {
  faturamentoCents: number;
  deliveredCount: number;
  ticketMedioCents: number;
  cancelledCount: number;
  series: ReportsSeriesPoint[];
  topItems: ReportsTopItem[];
  byType: ReportsBreakdown[];
  byPayment: ReportsBreakdown[];
  byNeighborhood: ReportsBreakdown[];
  byHour: ReportsHourPoint[];
}
