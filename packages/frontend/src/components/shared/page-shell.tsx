import type { ReactNode } from 'react';
import type { FeatureId } from '@struct-pass/shared';
import { PageHeader } from '@/components/shared/page-header';

interface PageShellProps {
  title: string;
  /**
   * 旧: お気に入りトグル☆ボタン用。お気に入り廃止（dashboard-0002）に伴い現在は未使用。
   * 54 ページが渡しているため呼び出し互換のため受理のみ（描画には影響しない）。
   */
  featureId?: FeatureId;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Struct Pass v2.1 標準ページシェル。
 * `sp-page`（青グレーペーパー背景）でラップし、PageHeader を上部に配置する。
 * 一覧 / 新規 / 詳細ページで使用。編集は EditPageShell を使う。
 */
export function PageShell({ title, actions, children }: PageShellProps) {
  return (
    <div className="sp-page">
      <PageHeader title={title} actions={actions} />
      {children}
    </div>
  );
}
