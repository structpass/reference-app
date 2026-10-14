import { Test, TestingModule } from '@nestjs/testing';
import { StocksRepository, forecastKey } from './stocks.repository';
import { PrismaService } from '../../../database/prisma.service';

// PrismaService 本体（非 tx 経路）は本 spec では使用しない。lockStockForUpdate は
// すべて tx 経由で呼ばれるため、空の mock で provider を満たすだけで十分。
// 予測集計（findManyForForecast / aggregatePendingReceiving|ShipmentByKey）も
// 引数の形で検証するため、該当モデルに jest.fn() を足す（ref-0064）。
const mockPrisma = {
  stock: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  receivingLine: {
    findMany: jest.fn(),
  },
  shipmentLine: {
    findMany: jest.fn(),
  },
};

describe('StocksRepository', () => {
  let repo: StocksRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StocksRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<StocksRepository>(StocksRepository);
    jest.clearAllMocks();
  });

  describe('lockStockForUpdate (CODE-H3)', () => {
    // FOR UPDATE は存在しない行をロックできない。初回入荷など stock 行が未作成の
    // (warehouse, product) でも確実にロック対象を得るため、INSERT ... ON CONFLICT
    // DO UPDATE で空行を冪等に確保してから FOR UPDATE する。この「ensure-row →
    // FOR UPDATE」の順序が崩れると H3 が再発するため、呼び出し順序を構造的に検証する。
    it('FOR UPDATE の前に ensure-row(INSERT ON CONFLICT) を実行すること（呼び出し順序）', async () => {
      const callOrder: string[] = [];

      const mockTx = {
        $executeRaw: jest.fn().mockImplementation(async () => {
          callOrder.push('ensureRow');
          return 1;
        }),
        $queryRaw: jest.fn().mockImplementation(async () => {
          callOrder.push('forUpdate');
          return [{ quantity: 0 }];
        }),
      };

      await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['ensureRow', 'forUpdate']);
    });

    it('ensure-row は tagged template（パラメータ化）で実行すること（injection セーフ）', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([{ quantity: 0 }]),
      };

      await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      // tagged template literal は第1引数に TemplateStringsArray、以降に補間値が渡る。
      // 文字列結合（$executeRawUnsafe 相当）に退行していないことを構造的に保証する。
      const firstArg = mockTx.$executeRaw.mock.calls[0][0];
      expect(Array.isArray(firstArg)).toBe(true);
      expect((firstArg as { raw?: unknown }).raw).toBeDefined();
      const interpolated = mockTx.$executeRaw.mock.calls[0].slice(1);
      expect(interpolated).toEqual([1, 'prod-1']);
    });

    it('ロック取得後の quantity を返すこと', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([{ quantity: 42 }]),
      };

      const result = await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      expect(result).toEqual([{ quantity: 42 }]);
    });

    it('行が無い結果でも例外を投げずそのまま返すこと（service 側で 0 フォールバック）', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([]),
      };

      const result = await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      expect(result).toEqual([]);
    });
  });

  describe('findManyForForecast (CODE-M2 予測一覧)', () => {
    it('warehouseId・search から予測絞り込み条件を組み立てて findMany/count へ渡すこと', async () => {
      mockPrisma.stock.findMany.mockResolvedValue([]);
      mockPrisma.stock.count.mockResolvedValue(0);

      await repo.findManyForForecast({ warehouseId: 3, search: 'ネジ' });

      const expectedWhere = {
        warehouseId: 3,
        product: {
          OR: [
            { name: { contains: 'ネジ', mode: 'insensitive' } },
            { code: { contains: 'ネジ', mode: 'insensitive' } },
          ],
        },
      };
      expect(mockPrisma.stock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          skip: 0,
          take: 20,
          orderBy: { id: 'asc' },
        }),
      );
      expect(mockPrisma.stock.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('条件が無い時は where を空のまま・既定ページングで渡すこと', async () => {
      mockPrisma.stock.findMany.mockResolvedValue([]);
      mockPrisma.stock.count.mockResolvedValue(0);

      await repo.findManyForForecast({ page: 2, limit: 10 });

      expect(mockPrisma.stock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 10,
          take: 10,
          orderBy: { id: 'asc' },
        }),
      );
      expect(mockPrisma.stock.count).toHaveBeenCalledWith({ where: {} });
    });

    it('findMany には関係テーブル include が付くこと（集計キー引きの前提）', async () => {
      mockPrisma.stock.findMany.mockResolvedValue([]);
      mockPrisma.stock.count.mockResolvedValue(0);

      await repo.findManyForForecast({});

      const args = mockPrisma.stock.findMany.mock.calls[0][0];
      expect(args.include).toBeDefined();
      expect(args.include.warehouse).toBeDefined();
      expect(args.include.product).toBeDefined();
    });
  });

  describe('aggregatePendingReceivingByKey (入荷見込み集計)', () => {
    it('空入力は early return しクエリを発行しないこと', async () => {
      const result = await repo.aggregatePendingReceivingByKey([]);

      expect(result).toEqual(new Map());
      expect(mockPrisma.receivingLine.findMany).not.toHaveBeenCalled();
    });

    it('下書きステータスのみ・削除済み除外で line を引くこと', async () => {
      mockPrisma.receivingLine.findMany.mockResolvedValue([]);

      await repo.aggregatePendingReceivingByKey(['prod-1', 'prod-2']);

      expect(mockPrisma.receivingLine.findMany).toHaveBeenCalledWith({
        where: {
          productId: { in: ['prod-1', 'prod-2'] },
          receiving: {
            status: 'DRAFT',
            deletedAt: null,
          },
        },
        select: {
          productId: true,
          plannedQty: true,
          receiving: { select: { warehouseId: true } },
        },
      });
    });

    it('(productId, warehouseId) キーで plannedQty を合算して返すこと', async () => {
      mockPrisma.receivingLine.findMany.mockResolvedValue([
        { productId: 'prod-1', plannedQty: 10, receiving: { warehouseId: 1 } },
        { productId: 'prod-1', plannedQty: 5, receiving: { warehouseId: 1 } },
        { productId: 'prod-1', plannedQty: 7, receiving: { warehouseId: 2 } },
        { productId: 'prod-2', plannedQty: 3, receiving: { warehouseId: 1 } },
      ]);

      const result = await repo.aggregatePendingReceivingByKey(['prod-1', 'prod-2']);

      expect(result.get('prod-1::1')).toBe(15);
      expect(result.get('prod-1::2')).toBe(7);
      expect(result.get('prod-2::1')).toBe(3);
    });
  });

  describe('aggregatePendingShipmentByKey (出荷見込み集計)', () => {
    it('空入力は early return しクエリを発行しないこと', async () => {
      const result = await repo.aggregatePendingShipmentByKey([]);

      expect(result).toEqual(new Map());
      expect(mockPrisma.shipmentLine.findMany).not.toHaveBeenCalled();
    });

    it('下書きステータスのみ・削除済み除外で line を引くこと', async () => {
      mockPrisma.shipmentLine.findMany.mockResolvedValue([]);

      await repo.aggregatePendingShipmentByKey(['prod-1']);

      expect(mockPrisma.shipmentLine.findMany).toHaveBeenCalledWith({
        where: {
          productId: { in: ['prod-1'] },
          shipment: {
            status: 'DRAFT',
            deletedAt: null,
          },
        },
        select: {
          productId: true,
          plannedQty: true,
          shipment: { select: { warehouseId: true } },
        },
      });
    });

    it('(productId, warehouseId) キーで plannedQty を合算して返すこと', async () => {
      mockPrisma.shipmentLine.findMany.mockResolvedValue([
        { productId: 'prod-1', plannedQty: 4, receiving: undefined, shipment: { warehouseId: 2 } },
        { productId: 'prod-1', plannedQty: 6, receiving: undefined, shipment: { warehouseId: 2 } },
      ]);

      const result = await repo.aggregatePendingShipmentByKey(['prod-1']);

      expect(result.get('prod-1::2')).toBe(10);
    });
  });

  describe('forecastKey', () => {
    it('productId と warehouseId を :: で合成したキーを返すこと', () => {
      expect(forecastKey('prod-1', 3)).toBe('prod-1::3');
    });
  });
});
