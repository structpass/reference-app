import { DashboardCountsView } from '@/features/dashboard-counts';

/**
 * ログイン後の着地ページ（dashboard-0006・ref-0015）。
 * 旧ダッシュボード（掲示板/在庫アラート）は Struct Hub（rete /hub）へ集約済み。
 * 現在は各マスタ・トランザクションの登録件数カードを表示する。
 * アプリシェル（Sidebar / ヘッダー / グローバルメニュー）は home/layout.tsx の AppShell が描画する。
 */
export default function HomePage() {
  return <DashboardCountsView />;
}
