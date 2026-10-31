import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRepository, DASHBOARD_COUNT_FEATURE_IDS } from '../dashboard.repository';
import { PrismaService } from '../../../../database/prisma.service';

const mockPrisma: Record<string, { count: jest.Mock }> = {
  product: { count: jest.fn() },
  warehouse: { count: jest.fn() },
  carrier: { count: jest.fn() },
  supplier: { count: jest.fn() },
  category: { count: jest.fn() },
  user: { count: jest.fn() },
  group: { count: jest.fn() },
  receiving: { count: jest.fn() },
  shipment: { count: jest.fn() },
  stocktaking: { count: jest.fn() },
  stock: { count: jest.fn() },
  order: { count: jest.fn() },
};

describe('DashboardRepository', () => {
  let repo: DashboardRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<DashboardRepository>(DashboardRepository);
  });

  it('12機能すべての featureId を対象に持つ', () => {
    expect(DASHBOARD_COUNT_FEATURE_IDS).toHaveLength(12);
    expect(DASHBOARD_COUNT_FEATURE_IDS).toEqual(
      expect.arrayContaining([
        'products',
        'warehouses',
        'carriers',
        'suppliers',
        'categories',
        'users',
        'groups',
        'receivings',
        'shipments',
        'stocktakings',
        'stocks',
        'orders',
      ]),
    );
  });

  it('渡された featureIds のみ count し、スコープ外の featureId は無視する', async () => {
    mockPrisma.product.count.mockResolvedValue(3);
    mockPrisma.warehouse.count.mockResolvedValue(5);

    const result = await repo.countByFeatureIds(['products', 'warehouses', 'permissions']);

    expect(result).toEqual([
      { featureId: 'products', count: 3 },
      { featureId: 'warehouses', count: 5 },
    ]);
    expect(mockPrisma.product.count).toHaveBeenCalled();
    expect(mockPrisma.warehouse.count).toHaveBeenCalled();
    // スコープ外の permissions はどの model にも count を発行しない
    expect(mockPrisma.carrier.count).not.toHaveBeenCalled();
  });

  it('空配列を渡すと空配列を返す（DB へ問い合わせない）', async () => {
    const result = await repo.countByFeatureIds([]);

    expect(result).toEqual([]);
    expect(mockPrisma.product.count).not.toHaveBeenCalled();
  });

  it('論理削除を持つ3モデルは deletedAt: null で生存行のみ count する（rev-quality 2026-07-31 DB-L1）', async () => {
    mockPrisma.receiving.count.mockResolvedValue(1);
    mockPrisma.shipment.count.mockResolvedValue(2);
    mockPrisma.order.count.mockResolvedValue(3);

    await repo.countByFeatureIds(['receivings', 'shipments', 'orders']);

    for (const model of ['receiving', 'shipment', 'order'] as const) {
      expect((mockPrisma[model] as { count: jest.Mock }).count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    }
  });
});
