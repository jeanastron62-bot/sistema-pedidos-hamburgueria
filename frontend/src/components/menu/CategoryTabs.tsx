import { Tabs } from '../ui/Tabs';
import type { Category } from '../../types';
import { VISIBLE_CATEGORIES } from './categories';

interface CategoryTabsProps<T extends string = Category> {
  active: T;
  onChange: (tab: T) => void;
  showTodos?: boolean;
}

export function CategoryTabs<T extends string = Category>({ active, onChange, showTodos = false }: CategoryTabsProps<T>) {
  const items = [
    ...(showTodos ? [{ key: 'ALL', label: 'Todos' }] : []),
    ...VISIBLE_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
  ];
  return (
    <Tabs
      items={items}
      active={active}
      onChange={(key) => onChange(key as T)}
    />
  );
}
