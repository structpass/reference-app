import { Injectable } from '@nestjs/common';
import type { FeatureId } from '@struct-pass/shared';
import { PrismaService } from '../../../database/prisma.service';

// featureId ↔ count() 対象モデルの対応（DEFAULT_ROLE_PERMISSIONS のうち
// 「マスタ/トランザクションの登録件数」スコープに含まれる12機能のみ）。
// キーを FeatureId に束縛し、論理 featureId 集合に無い ID の混入を型で防ぐ。
const COUNTERS: Partial<Record<FeatureId, (prisma: PrismaService) => Promise<number>>> = {
  products: (p) => p.product.count(),
  warehouses: (p) => p.warehouse.count(),
  carriers: (p) => p.carrier.count(),
  suppliers: (p) => p.supplier.count(),
  categories: (p) => p.category.count(),
  users: (p) => p.user.count(),
  groups: (p) => p.group.count(),
  // 論理削除（deletedAt）を持つ3モデルは生存行のみ計上（rev-quality 2026-07-31 DB-L1: 削除済みの過大計上を解消）
  receivings: (p) => p.receiving.count({ where: { deletedAt: null } }),
  shipments: (p) => p.shipment.count({ where: { deletedAt: null } }),
  stocktakings: (p) => p.stocktaking.count(),
  stocks: (p) => p.stock.count(),
  orders: (p) => p.order.count({ where: { deletedAt: null } }),
};

export const DASHBOARD_COUNT_FEATURE_IDS = Object.keys(COUNTERS) as FeatureId[];

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countByFeatureIds(featureIds: string[]): Promise<{ featureId: string; count: number }[]> {
    const counters = featureIds
      .filter((id): id is FeatureId => id in COUNTERS)
      .flatMap((id) => {
        const counter = COUNTERS[id];
        return counter ? [{ featureId: id, counter }] : [];
      });
    const counts = await Promise.all(counters.map(({ counter }) => counter(this.prisma)));
    return counters.map(({ featureId }, i) => ({ featureId, count: counts[i] }));
  }
}
