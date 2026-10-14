'use client';

import { useState } from 'react';
import { MarkdownPreview } from './markdown-preview';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';

interface MarkdownTabsProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

type TabKey = 'edit' | 'preview';

export function MarkdownTabs({
  value,
  onChange,
  placeholder,
  rows = 12,
  disabled,
}: MarkdownTabsProps) {
  const [tab, setTab] = useState<TabKey>('edit');
  const { listRef, onMouseOver, onMouseLeave, bandStyle } = useRowHoverBand<HTMLDivElement>(
    '[data-markdown-tab]',
    'horizontal',
  );

  return (
    <div className="flex flex-col rounded-md border border-border">
      <div
        className="relative flex border-b border-border bg-muted/40"
        ref={listRef}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {bandStyle ? (
          <div aria-hidden="true" className="markdown-tabs-hoverband" style={bandStyle} />
        ) : null}
        <TabButton active={tab === 'edit'} onClick={() => setTab('edit')}>
          入力
        </TabButton>
        <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
          プレビュー
        </TabButton>
      </div>
      <div className="p-3">
        {tab === 'edit' ? (
          <textarea
            className="w-full resize-y rounded border border-border bg-background p-2 font-mono text-sm outline-none focus:ring-1 focus:ring-brand-teal disabled:opacity-50"
            rows={rows}
            value={value}
            placeholder={placeholder ?? 'Markdown で入力できます'}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        ) : (
          <div className="min-h-[200px]">
            {value.trim().length > 0 ? (
              <MarkdownPreview source={value} />
            ) : (
              <p className="text-sm text-[var(--sp-text-warm-mute)]">（入力がありません）</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // cmn-0135: タブのアクティブ下線は 2px（cmn-0134 で 1px へ落としたが選択が見えづらく差し戻し・
  // rete のタブ下線と同値）。非アクティブにも透明の 2px を持たせて高さを揃える。
  return (
    <button
      type="button"
      data-markdown-tab
      onClick={onClick}
      className={
        'relative z-10 border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-brand-teal text-brand-teal'
          : 'text-[var(--sp-text-warm-mute)] hover:text-[var(--sp-text-warm)]')
      }
    >
      {children}
    </button>
  );
}
