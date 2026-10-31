'use client';

import { Spinner } from '@/components/ui/spinner';
import {
  navCategories,
  navItemByFeatureId,
  type MatrixCategoryKey,
  type NavItem,
} from '@/components/layout/nav-config';
import { isObjectTypePermissionId, type FeatureId } from '@struct-pass/shared';
import { useDashboardCounts } from '../lib/use-dashboard-counts';

// /home が表示する4区分（マスタ管理/入出荷管理/在庫管理/発注管理）。
// 運用管理(F)・システム管理(E) は「各マスタ・トランザクションの件数」のスコープ外。
const DASHBOARD_CATEGORY_KEYS: MatrixCategoryKey[] = ['A', 'B', 'C', 'D'];

/**
 * Home サマリ（ref-0019・handoff「Webシステム ホーム画面の改善」案3a Glass Card）。
 * 各グループ＝「グループ名＋件数ラベル」見出し＋4カラムのガラスカードグリッド。
 * 表示のみ（クリック遷移なし）。データ層（/dashboard/counts・count を持つ項目のみ描画する
 * フィルタ）は ref-0015 のまま無改修で流用する。見た目の値は globals.css の
 * .home-summary / .home-glass-card 系（handoff README ピクセル準拠）。
 */
export function DashboardCountsView() {
  const { counts, loading, error } = useDashboardCounts();

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
        {error}
      </div>
    );
  }

  const countByFeatureId = new Map(counts.map((c) => [c.featureId, c.count]));
  const categories = navCategories.filter(
    (cat) => cat.categoryKey && DASHBOARD_CATEGORY_KEYS.includes(cat.categoryKey),
  );

  return (
    <div className="home-summary">
      {categories.map((cat) => {
        const items = cat.items.filter((item): item is NavItem & { featureId: FeatureId } => {
          const featureId = item.featureId;
          return (
            !!featureId && !isObjectTypePermissionId(featureId) && countByFeatureId.has(featureId)
          );
        });
        if (items.length === 0) return null;

        return (
          <section key={cat.label} className="home-summary-group">
            <div className="home-summary-head">
              <h2 className="home-summary-title">{cat.label}</h2>
              <span className="home-summary-count">{items.length}項目</span>
            </div>
            <div className="home-summary-grid">
              {items.map((item) => {
                const navItem = item.featureId ? navItemByFeatureId[item.featureId] : undefined;
                const Icon = navItem?.icon;
                const count = item.featureId ? countByFeatureId.get(item.featureId) : undefined;
                return (
                  <div key={item.featureId} className="home-glass-card">
                    <div className="home-glass-card-label">
                      {Icon && <Icon aria-hidden="true" />}
                      <span>{item.label}</span>
                    </div>
                    {/* 3桁区切りカンマ表示（handoff Data: 1,000 / 4,090）。 */}
                    <div className="home-glass-card-num">{count?.toLocaleString('en-US')}</div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
