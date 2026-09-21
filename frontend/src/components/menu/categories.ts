import type { Category } from '../../types';

export type MenuTab = Category | 'ALL';

// Ordem canonica das categorias navegaveis + labels. Fonte unica reusada pelo
// CategoryTabs (abas) e pelo PublicMenu (cabecalhos de secao da aba "Todos").
// ACRESCIMOS deliberadamente ausente -- nunca e aba nem secao (CONTEXTO.md secao 10)
export const VISIBLE_CATEGORIES: { key: Category; label: string }[] = [
  { key: 'HOT_DOGS', label: 'Hot-Dogs' },
  { key: 'HAMBURGUERES', label: 'Hambúrgueres' },
  { key: 'MACARRAO_NA_CHAPA', label: 'Macarrão na Chapa' },
  { key: 'BEBIDAS', label: 'Bebidas' },
];
