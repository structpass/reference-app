'use client';

import type { ReactNode } from 'react';
import { FilterBar, type FilterField } from '@/components/shared/filter-bar';

interface FilterBarCardProps {
  fields: FilterField[];
  onFilterChange: (filters: Record<string, string | undefined>) => void;
  actions?: ReactNode;
}

/**
 * Struct Pass v2.1 標準フィルターカード。
 * sp-line-warm 枠 + sp-card 背景の中に FilterBar を配置する。
 */
export function FilterBarCard({ fields, onFilterChange, actions }: FilterBarCardProps) {
  return (
    <div className="mb-2 rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)] p-2">
      <FilterBar fields={fields} onFilterChange={onFilterChange} actions={actions} />
    </div>
  );
}
