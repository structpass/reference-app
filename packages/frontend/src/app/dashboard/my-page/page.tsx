'use client';

import { PageShell } from '@/components/shared/page-shell';

/**
 * マイページ。
 * お気に入りは Struct Hub（rete /hub）へ集約（dashboard-0002）。
 * 今後フォントサイズ・プロフィール等の設定項目をここに追加していく。
 */
export default function MyPage() {
  return (
    <PageShell title="マイページ">
      <p className="text-sm text-[var(--sp-text-warm-mute)]">
        現在表示できる設定項目はありません。
      </p>
    </PageShell>
  );
}
