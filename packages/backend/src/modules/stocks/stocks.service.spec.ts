import { Test, TestingModule } from '@nestjs/testing';
import { StocksService } from './stocks.service';
import { StocksRepository } from './repositories/stocks.repository';

const mockStock = {
  id: 1,
  warehouseId: 1,
  productId: 'prod-1',
  quantity: 100,
  warehouse: { id: 1, name: '倉庫A', code: 'WH-001' },
  product: {
    id: 'prod-1',
    name: 'テスト商品',
    code: 'PRD-001',
    unit: '個',
    category: { id: 1, name: '電子機器' },
  },
};

const mockRepo = {
  findManyPaginated: jest.fn(),
  findManyForExport: jest.fn(),
  findManyForForecast: jest.fn(),
  lockStockForUpdate: jest.fn(),
  upsertStockIncrement: jest.fn(),
  upsertStockOverwrite: jest.fn(),
  createAdjustment: jest.fn(),
  aggregatePendingReceivingByKey: jest.fn(),
  aggregatePendingShipmentByKey: jest.fn(),
};

// CODE-M2: 一括集計は (productId × warehouseId) のキー引き Map を返す。
// mockStock は product.id='prod-1' / warehouseId=1 のため key は 'prod-1::1'。
const keyOf = (productId: string, warehouseId: number) => `${productId}::${warehouseId}`;
const mapFor = (qty: number) => new Map([[keyOf('prod-1', 1), qty]]);

describe('StocksService', () => {
  let service: StocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StocksService, { provide: StocksRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<StocksService>(StocksService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('PaginatedResponse<StockWithRelationsResponseDto> shape を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockStock],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
      const item = result.data[0];
      expect(item).toHaveProperty('id', 1);
      expect(item).toHaveProperty('warehouseId', 1);
      expect(item).toHaveProperty('productId', 'prod-1');
      expect(item).toHaveProperty('quantity', 100);
      expect(item).toHaveProperty('warehouse');
      expect(item).toHaveProperty('product');
    });
  });

  describe('findAllForExport', () => {
    it('StockExportResponseDto 配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockStock]);

      const result = await service.findAllForExport({});

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('id', 1);
      expect(result[0]).toHaveProperty('quantity', 100);
      expect(result[0]).toHaveProperty('warehouse');
      expect(result[0]).toHaveProperty('product');
    });
  });

  describe('adjustStock', () => {
    it('lockForUpdateで現在値を取得しincrementで在庫を加算すること', async () => {
      const tx = {} as never;
      mockRepo.lockStockForUpdate.mockResolvedValue([{ quantity: 100 }]);

      const result = await service.adjustStock(
        tx,
        1,
        'prod-1',
        10,
        'RECEIVING' as never,
        'user-1',
        '入荷',
      );

      expect(result).toEqual({ quantityBefore: 100, quantityAfter: 110 });
      expect(mockRepo.lockStockForUpdate).toHaveBeenCalledWith(tx, 1, 'prod-1');
      expect(mockRepo.upsertStockIncrement).toHaveBeenCalledWith(tx, 1, 'prod-1', 10, 110);
      expect(mockRepo.createAdjustment).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ quantityBefore: 100, quantityAfter: 110 }),
      );
    });

    it('在庫レコードがない場合に0から開始すること', async () => {
      const tx = {} as never;
      mockRepo.lockStockForUpdate.mockResolvedValue([]);

      const result = await service.adjustStock(tx, 1, 'prod-1', 5, 'RECEIVING' as never, 'user-1');

      expect(result).toEqual({ quantityBefore: 0, quantityAfter: 5 });
      expect(mockRepo.upsertStockIncrement).toHaveBeenCalledWith(tx, 1, 'prod-1', 5, 5);
    });
  });

  describe('overwriteStock', () => {
    it('在庫を上書きしStockAdjustmentを記録すること', async () => {
      const tx = {} as never;
      mockRepo.lockStockForUpdate.mockResolvedValue([{ quantity: 100 }]);

      const result = await service.overwriteStock(
        tx,
        1,
        'prod-1',
        80,
        'STOCKTAKING' as never,
        'user-1',
        '棚卸',
      );

      expect(result).toEqual({ quantityBefore: 100, quantityAfter: 80 });
      expect(mockRepo.upsertStockOverwrite).toHaveBeenCalledWith(tx, 1, 'prod-1', 80);
      expect(mockRepo.createAdjustment).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ quantityBefore: 100, quantityAfter: 80 }),
      );
    });

    it('在庫レコードがない場合に0から上書きすること', async () => {
      const tx = {} as never;
      mockRepo.lockStockForUpdate.mockResolvedValue([]);

      const result = await service.overwriteStock(
        tx,
        1,
        'prod-1',
        50,
        'STOCKTAKING' as never,
        'user-1',
      );

      expect(result).toEqual({ quantityBefore: 0, quantityAfter: 50 });
    });
  });

  describe('getForecast', () => {
    it('予測在庫とアラートを返すこと', async () => {
      mockRepo.findManyForForecast.mockResolvedValue({
        stocks: [mockStock],
        total: 1,
        page: 1,
        limit: 20,
      });
      mockRepo.aggregatePendingReceivingByKey.mockResolvedValue(mapFor(20));
      mockRepo.aggregatePendingShipmentByKey.mockResolvedValue(mapFor(5));

      const result = await service.getForecast({ page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(result.data[0].incomingQty).toBe(20);
      expect(result.data[0].outgoingQty).toBe(5);
      expect(result.data[0].forecastQty).toBe(115);
      expect(result.data[0].alert).toBe('normal');
    });

    it('在庫不足リスクを検出すること', async () => {
      const lowStock = { ...mockStock, quantity: 5 };
      mockRepo.findManyForForecast.mockResolvedValue({
        stocks: [lowStock],
        total: 1,
        page: 1,
        limit: 20,
      });
      mockRepo.aggregatePendingReceivingByKey.mockResolvedValue(mapFor(0));
      mockRepo.aggregatePendingShipmentByKey.mockResolvedValue(mapFor(10));

      const result = await service.getForecast({ page: 1, limit: 20 });

      expect(result.data[0].forecastQty).toBe(-5);
      expect(result.data[0].alert).toBe('shortageRisk');
    });

    it('過剰在庫を検出すること', async () => {
      mockRepo.findManyForForecast.mockResolvedValue({
        stocks: [mockStock],
        total: 1,
        page: 1,
        limit: 20,
      });
      mockRepo.aggregatePendingReceivingByKey.mockResolvedValue(mapFor(300));
      mockRepo.aggregatePendingShipmentByKey.mockResolvedValue(mapFor(0));

      const result = await service.getForecast({ page: 1, limit: 20 });

      expect(result.data[0].forecastQty).toBe(400);
      expect(result.data[0].alert).toBe('surplus');
    });

    it('該当する入荷/出荷見込みが無い場合に0として扱うこと', async () => {
      mockRepo.findManyForForecast.mockResolvedValue({
        stocks: [mockStock],
        total: 1,
        page: 1,
        limit: 20,
      });
      // 一括集計の戻り Map に当該キーが無い = 見込み 0 件のケース。
      mockRepo.aggregatePendingReceivingByKey.mockResolvedValue(new Map());
      mockRepo.aggregatePendingShipmentByKey.mockResolvedValue(new Map());

      const result = await service.getForecast({ page: 1, limit: 20 });

      expect(result.data[0].incomingQty).toBe(0);
      expect(result.data[0].outgoingQty).toBe(0);
      expect(result.data[0].forecastQty).toBe(100);
    });

    it('集計クエリを stock 件数に依らず入荷/出荷の各 1 回ずつに畳むこと（CODE-M2: N+1 解消）', async () => {
      const stockB = {
        ...mockStock,
        id: 2,
        product: { ...mockStock.product, id: 'prod-2' },
      };
      mockRepo.findManyForForecast.mockResolvedValue({
        stocks: [mockStock, stockB],
        total: 2,
        page: 1,
        limit: 20,
      });
      mockRepo.aggregatePendingReceivingByKey.mockResolvedValue(new Map());
      mockRepo.aggregatePendingShipmentByKey.mockResolvedValue(new Map());

      await service.getForecast({ page: 1, limit: 20 });

      // stock 2 件でも集計呼び出しは各 1 回（旧実装なら 2 件 × 2 = 4 回）
      expect(mockRepo.aggregatePendingReceivingByKey).toHaveBeenCalledTimes(1);
      expect(mockRepo.aggregatePendingShipmentByKey).toHaveBeenCalledTimes(1);
      // 重複排除した productId 集合が渡る
      expect(mockRepo.aggregatePendingReceivingByKey).toHaveBeenCalledWith(['prod-1', 'prod-2']);
    });
  });

  describe('getForecastForExport', () => {
    it('ページネーションなしで予測在庫一覧を返すこと', async () => {
      mockRepo.findManyForForecast.mockResolvedValue({
        stocks: [mockStock],
        total: 1,
        page: 1,
        limit: 10000,
      });
      mockRepo.aggregatePendingReceivingByKey.mockResolvedValue(mapFor(10));
      mockRepo.aggregatePendingShipmentByKey.mockResolvedValue(mapFor(5));

      const result = await service.getForecastForExport({});

      expect(Array.isArray(result)).toBe(true);
      expect(result[0].forecastQty).toBe(105);
    });
  });
});
