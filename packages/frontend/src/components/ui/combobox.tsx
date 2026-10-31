'use client';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  value = '',
  onValueChange,
  options,
  placeholder = '選択してください',
  searchPlaceholder = '検索...',
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  // a11y: listbox/option の id 紐付け（aria-activedescendant 用）。インスタンス毎に一意（rev-quality 2026-07-31 CODE-M2）
  const listboxId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const portalRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pos, setPos] = React.useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 0, left: 0, width: 0, maxHeight: 240 });

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  const selectedLabel = React.useMemo(
    () => options.find((o) => o.value === value)?.label,
    [options, value],
  );

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }

    const update = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const margin = 8;
      const desired = 280; // 検索バー(~40px) + リスト max-h-60(240px)
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const placeAbove = spaceBelow < desired && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(desired, placeAbove ? spaceAbove : spaceBelow));
      if (placeAbove) {
        setPos({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left,
          width: rect.width,
          maxHeight,
        });
      } else {
        setPos({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          maxHeight,
        });
      }
    };

    update();
    requestAnimationFrame(() => inputRef.current?.focus());

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Close on outside click / escape
  React.useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const timer = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleMouseDown);
    });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (optValue: string) => {
    onValueChange?.(optValue);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-[var(--sp-input-h)] w-full items-center justify-between rounded-md border border-input bg-input-bg px-3 text-sm focus:border-[var(--sp-focus-border)] focus:outline-none disabled:cursor-not-allowed disabled:bg-[var(--sp-disabled-bg)] disabled:text-[var(--sp-text-warm-mute)]',
          className,
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span className={cn('block truncate', !selectedLabel && 'text-muted-foreground/60')}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--sp-text-warm-mute)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            ref={portalRef}
            className="fixed z-[9999] flex flex-col rounded-md border bg-popover text-popover-foreground shadow-lg"
            style={{
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
            <div className="flex shrink-0 items-center border-b px-3 py-2 focus-within:border-b-[var(--sp-focus-border)]">
              <Search className="mr-2 h-4 w-4 shrink-0 text-[var(--sp-text-warm-mute)]" />
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--sp-text-warm-mute)]"
                placeholder={searchPlaceholder}
                aria-controls={listboxId}
                aria-activedescendant={
                  filtered.length > 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (
                      filtered.length > 0 &&
                      highlightedIndex >= 0 &&
                      highlightedIndex < filtered.length
                    ) {
                      handleSelect(filtered[highlightedIndex].value);
                    }
                  }
                }}
              />
            </div>
            <div className="flex-1 overflow-auto p-1" role="listbox" id={listboxId}>
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-[var(--sp-text-warm-mute)]">
                  該当なし
                </div>
              ) : (
                filtered.map((opt, index) => (
                  <div
                    key={opt.value}
                    id={`${listboxId}-opt-${index}`}
                    ref={(el) => {
                      if (index === highlightedIndex && el) {
                        el.scrollIntoView({ block: 'nearest' });
                      }
                    }}
                    role="option"
                    aria-selected={value === opt.value}
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-[0.1875rem] py-1.5 pl-8 pr-2 text-sm outline-none',
                      value === opt.value &&
                        index !== highlightedIndex &&
                        'bg-[var(--sp-select-soft)]',
                      index === highlightedIndex && 'bg-[var(--sp-select-hover)]',
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelect(opt.value);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {value === opt.value && (
                      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                    {opt.label}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
