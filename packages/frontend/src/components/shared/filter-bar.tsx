'use client';

import { useState, useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, X } from 'lucide-react';

export interface FilterField {
  key: string;
  label: string;
  type: 'search' | 'select';
  placeholder?: string;
  /** select 用の選択肢。空配列でも警告は出さない（loading 時の暫定 0 件を許容） */
  options?: { value: string; label: string }[];
  widthClass?: string;
  /**
   * select trigger の頭に置く icon。指定すると label 固定表現になり、選択中は teal + 右上 ink 丸。
   * 未指定なら通常 dropdown（選択値を trigger に表示）。
   */
  icon?: React.ComponentType<{ className?: string }>;
}

interface FilterBarProps {
  fields: FilterField[];
  onFilterChange: (filters: Record<string, string | undefined>) => void;
  actions?: React.ReactNode;
}

const ICON_BTN_CLASS =
  'inline-flex h-[var(--sp-input-h-compact)] items-center gap-1 rounded px-1.5 text-xs font-medium text-[var(--sp-text-warm-mute)] transition-colors hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)] focus-visible:outline-none';

/**
 * Struct Pass v2.2 標準フィルターバー。
 * - search: h-[var(--sp-input-h-compact)]（32px・mdl-0027）rounded-[0.1875rem] focus teal
 * - select (icon 付き): DropdownMenu。ラベル固定、選択中 teal + 右上 ink 丸
 * - select (icon 無し): DropdownMenu。選択値を trigger に表示
 */
export function FilterBar({ fields, onFilterChange, actions }: FilterBarProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onFilterChangeRef = useRef(onFilterChange);
  onFilterChangeRef.current = onFilterChange;

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const filters: Record<string, string | undefined> = {};
      for (const [key, val] of Object.entries(values)) {
        filters[key] = val || undefined;
      }
      onFilterChangeRef.current(filters);
    }, 300);
    return () => clearTimeout(timeoutRef.current);
  }, [values]);

  const updateValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const isDirty = Object.values(values).some((v) => !!v);
  const handleClear = () => setValues({});

  return (
    <div className="flex flex-wrap items-center gap-1">
      {fields.map((field) => {
        if (field.type === 'search') {
          return (
            <div key={field.key} className={cn('relative', field.widthClass ?? 'w-64')}>
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sp-text-warm-mute)]" />
              <input
                type="search"
                placeholder={field.placeholder ?? `${field.label}で検索...`}
                value={values[field.key] ?? ''}
                onChange={(e) => updateValue(field.key, e.target.value)}
                className="h-[var(--sp-input-h-compact)] w-full rounded-[0.1875rem] border border-[var(--sp-line-warm)] bg-[var(--sp-card)] pl-7 pr-2 text-xs text-[var(--sp-text-warm)] outline-none placeholder:text-[var(--sp-text-warm-mute)] focus:border-[var(--sp-focus-border)]"
                aria-label={field.placeholder ?? `${field.label}で検索`}
              />
            </div>
          );
        }

        // select type
        const Icon = field.icon;
        const isActive = !!values[field.key];
        const selected = field.options?.find((o) => o.value === values[field.key]);

        return (
          <DropdownMenu key={field.key}>
            <DropdownMenuTrigger
              className={cn(
                ICON_BTN_CLASS,
                'relative',
                isActive &&
                  Icon &&
                  'text-[var(--sp-accent-teal)] hover:text-[var(--sp-accent-teal)]',
              )}
              aria-label={`${field.label}で絞り込み`}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
              <span>{Icon ? field.label : (selected?.label ?? field.label)}</span>
              {!Icon && <ChevronDown className="h-3 w-3" />}
              {isActive && Icon && (
                <span
                  aria-hidden="true"
                  className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--sp-accent-ink)]"
                />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 min-w-[10rem] overflow-y-auto">
              <DropdownMenuItem
                onClick={() => updateValue(field.key, '')}
                className={!values[field.key] ? 'bg-[var(--sp-select-soft)]' : ''}
              >
                全{field.label}
              </DropdownMenuItem>
              {field.options?.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => updateValue(field.key, opt.value)}
                  className={values[field.key] === opt.value ? 'bg-[var(--sp-select-soft)]' : ''}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      {fields.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          disabled={!isDirty}
          className={cn(
            ICON_BTN_CLASS,
            'ml-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--sp-text-warm-mute)]',
          )}
          aria-label="フィルタをクリア"
        >
          <X className="h-3.5 w-3.5" />
          <span>クリア</span>
        </button>
      )}

      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  );
}
