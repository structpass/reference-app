import type { ReactNode } from 'react';
import type { FeatureId } from '@struct-pass/shared';
import { PageHeader } from '@/components/shared/page-header';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface EditPageShellProps {
  title: string;
  /**
   * 旧: お気に入りトグル☆ボタン用。お気に入り廃止（dashboard-0002）に伴い現在は未使用。
   * 呼び出し互換のため受理のみ（描画には影響しない）。
   */
  featureId?: FeatureId;
  actions: ReactNode;
  children: ReactNode;
  /** compact: action row の下罫線を消し、フォームに近づける（products pilot で使用） */
  compact?: boolean;
}

export function EditPageLoader() {
  return (
    <div className="flex justify-center py-12">
      <Spinner className="h-8 w-8 text-primary" />
    </div>
  );
}

export function EditPageNotFound({ message }: { message: string }) {
  return <div className="py-12 text-center text-[var(--sp-text-warm-mute)]">{message}</div>;
}

/**
 * Struct Pass v2.1 標準編集ページシェル。
 * 画面高さいっぱいの flex column にし、上部にヘッダ + sticky アクション行、
 * 下部に flex-1 の overflow-y-auto コンテンツ領域を配置する。
 *
 * dashboard/layout の `p-3 md:p-6` を打ち消すために `-m-3 md:-m-6` で塗り直し、
 * sp-paper（青グレーペーパー）背景を全面に当てる。
 */
export function EditPageShell({ title, actions, children, compact }: EditPageShellProps) {
  return (
    <div className="-m-3 flex h-[calc(100vh-36px)] flex-col bg-[var(--sp-paper)] md:-m-6">
      <div className="sticky top-0 z-10 shrink-0 bg-[var(--sp-paper)] px-3 pt-3 md:px-6 md:pt-6">
        <PageHeader title={title} />
        <div
          className={cn(
            'flex items-center justify-end gap-2',
            compact ? 'mb-1 pb-1' : 'mb-3 border-b border-[var(--sp-line-warm)] pb-3',
          )}
        >
          {actions}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 md:px-6 md:pb-6">{children}</div>
    </div>
  );
}
