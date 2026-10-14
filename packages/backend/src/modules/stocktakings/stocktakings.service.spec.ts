import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StocktakingsService } from './stocktakings.service';
import { StocktakingsRepository } from './repositories/stocktakings.repository';
import { StocksService } from '../stocks/stocks.service';
import { makeStocktakingEntity } from '@/__tests__/factories';

const _stocktakingOverrides = {
  stocktakingDate: new Date('2026-03-16'),
  warehouseId: 1,
  stocktaker: '担当者A',
  warehouse: { id: 1, name: '倉庫A', code: 'WH-001' },
  items: [],
};

// Entity-shape mock (what updateStatusInTx returns — Prisma entity with relations)
const mockStocktakingEntity = makeStocktakingEntity(_stocktakingOverrides);

// DTO-shape mock (what repository DTO-path methods return after mapper)
const mockStocktakingDto = makeStocktakingEntity(_stocktakingOverrides);

// Legacy alias for tests using plain entity shape (findById / findByIdWithItems path)
const mockStocktaking = mockStocktakingEntity;

// 単一トランザクション検証用の tx センチネル（同一性アサート用）
const mockTx = { __tx: 'stocktakings' };

const mockRepo = {
  findById: jest.fn(),
  findByIdWithItems: jest.fn(),
  findByIdWithRelations: jest.fn(),
  findManyPaginated: jest.fn(),
  findManyForExport: jest.fn(),
  create: jest.fn(),
  updateInTx: jest.fn(),
  updateStatusInTx: jest.fn(),
  delete: jest.fn(),
  deleteItemsInTx: jest.fn(),
  runInTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
};

const mockStocksService = {
  overwriteStock: jest.fn(),
};

describe('StocktakingsService', () => {
  let service: StocktakingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StocktakingsService,
        { provide: StocktakingsRepository, useValue: mockRepo },
        { provide: StocksService, useValue: mockStocksService },
      ],
    }).compile();

    service = module.get<StocktakingsService>(StocktakingsService);
    jest.clearAllMocks();
    mockRepo.runInTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockTx),
    );
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('PaginatedResponse<StocktakingWithRelationsResponseDto> shape を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockStocktakingDto],
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
      expect(item).toHaveProperty('status', 'DRAFT');
      expect(item).toHaveProperty('warehouse');
      expect(item).toHaveProperty('creator');
    });
  });

  describe('findAllForExport', () => {
    it('StocktakingResponseDto 配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockStocktakingDto]);

      const result = await service.findAllForExport({});

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('id', 1);
      expect(result[0]).toHaveProperty('warehouseId', 1);
      expect(result[0]).toHaveProperty('status', 'DRAFT');
    });
  });

  describe('findOne', () => {
    it('SingleResponse<StocktakingWithRelationsResponseDto> shape を返すこと', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(mockStocktakingDto);

      const result = await service.findOne(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('warehouseId', 1);
      expect(result.data).toHaveProperty('status', 'DRAFT');
      expect(result.data).toHaveProperty('warehouse');
      expect(result.data).toHaveProperty('creator');
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('DTO shape を返すこと', async () => {
      mockRepo.create.mockResolvedValue(mockStocktakingDto);

      const result = await service.create(
        {
          stocktakingDate: '2026-03-16',
          warehouseId: 1,
          stocktaker: '担当者A',
          items: [
            { productId: 'prod-1', theoreticalQty: 100, actualQty: 98, differenceReason: '破損' },
          ],
        },
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('warehouse');
    });

    it('差異を自動計算すること', async () => {
      mockRepo.create.mockResolvedValue(mockStocktakingDto);

      await service.create(
        {
          stocktakingDate: '2026-03-16',
          warehouseId: 1,
          stocktaker: '担当者A',
          items: [{ productId: 'prod-1', theoreticalQty: 100, actualQty: 95 }],
        },
        'user-1',
      );

      const createCall = mockRepo.create.mock.calls[0][0];
      const itemData = createCall.items.create[0];
      expect(itemData.difference).toBe(-5);
    });

    it('actualQtyがundefinedの場合にdifferenceをnullにすること', async () => {
      mockRepo.create.mockResolvedValue(mockStocktakingDto);

      await service.create(
        {
          stocktakingDate: '2026-03-16',
          warehouseId: 1,
          stocktaker: '担当者A',
          items: [{ productId: 'prod-1', theoreticalQty: 100 }],
        },
        'user-1',
      );

      const createCall = mockRepo.create.mock.calls[0][0];
      const itemData = createCall.items.create[0];
      expect(itemData.difference).toBeNull();
    });
  });

  describe('update', () => {
    it('DRAFT状態の棚卸を更新しDTO shape を返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockStocktakingEntity);
      mockRepo.updateInTx.mockResolvedValue(mockStocktakingEntity);

      const result = await service.update(1, { stocktaker: '担当者B' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('warehouse');
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, { stocktaker: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('DRAFT以外の場合にBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockStocktaking, status: 'CONFIRMED' });

      await expect(service.update(1, { stocktaker: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('明細行を置き換えること', async () => {
      mockRepo.findById.mockResolvedValue(mockStocktaking);
      mockRepo.deleteItemsInTx.mockResolvedValue({ count: 0 });
      mockRepo.updateInTx.mockResolvedValue(mockStocktaking);

      await service.update(1, {
        items: [{ productId: 'prod-1', theoreticalQty: 100, actualQty: 90 }],
      });

      expect(mockRepo.deleteItemsInTx).toHaveBeenCalledWith(mockTx, 1);
    });

    it('明細置換が単一トランザクション内で実行されること（CODE-H1: delete と update が同一 tx）', async () => {
      mockRepo.findById.mockResolvedValue(mockStocktaking);
      mockRepo.deleteItemsInTx.mockResolvedValue({ count: 0 });
      mockRepo.updateInTx.mockResolvedValue(mockStocktaking);

      await service.update(1, {
        items: [{ productId: 'prod-1', theoreticalQty: 100, actualQty: 90 }],
      });

      expect(mockRepo.runInTransaction).toHaveBeenCalledTimes(1);
      const deleteTx = mockRepo.deleteItemsInTx.mock.calls[0][0];
      const updateTx = mockRepo.updateInTx.mock.calls[0][0];
      expect(deleteTx).toBe(mockTx);
      expect(updateTx).toBe(mockTx);
      expect(deleteTx).toBe(updateTx);
    });

    it('明細を変更しない場合でも update は tx 内で実行されること（CODE-H1）', async () => {
      mockRepo.findById.mockResolvedValue(mockStocktaking);
      mockRepo.updateInTx.mockResolvedValue(mockStocktaking);

      await service.update(1, { stocktaker: '担当者B' });

      expect(mockRepo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(mockRepo.deleteItemsInTx).not.toHaveBeenCalled();
      expect(mockRepo.updateInTx).toHaveBeenCalledWith(mockTx, 1, expect.any(Object));
    });
  });

  describe('remove', () => {
    it('DRAFT棚卸をハードデリートすること', async () => {
      mockRepo.findById.mockResolvedValue(mockStocktaking);
      mockRepo.delete.mockResolvedValue(mockStocktaking);

      const result = await service.remove(1);

      expect(result).toEqual({
        success: true,
        data: { message: 'Stocktaking deleted successfully' },
      });
      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });

    it('DRAFT以外はBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockStocktaking, status: 'CONFIRMED' });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm', () => {
    it('DRAFT棚卸を確定しDTO shape を返すこと', async () => {
      const withItems = {
        ...mockStocktakingEntity,
        items: [
          { productId: 'prod-1', actualQty: 95, theoreticalQty: 100 },
          { productId: 'prod-2', actualQty: 50, theoreticalQty: 50 },
        ],
      };
      mockRepo.findByIdWithItems.mockResolvedValue(withItems);
      mockRepo.updateStatusInTx.mockResolvedValue({
        ...mockStocktakingEntity,
        status: 'CONFIRMED',
      });

      const result = await service.confirm(1, 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('status', 'CONFIRMED');
      expect(result.data).toHaveProperty('warehouse');
      expect(mockStocksService.overwriteStock).toHaveBeenCalledTimes(2);
      expect(mockStocksService.overwriteStock).toHaveBeenCalledWith(
        expect.anything(),
        1,
        'prod-1',
        95,
        expect.anything(),
        'user-1',
        expect.any(String),
      );
    });

    it('actualQtyがnullのアイテムはスキップすること', async () => {
      const withItems = {
        ...mockStocktakingEntity,
        items: [
          { productId: 'prod-1', actualQty: null, theoreticalQty: 100 },
          { productId: 'prod-2', actualQty: 50, theoreticalQty: 50 },
        ],
      };
      mockRepo.findByIdWithItems.mockResolvedValue(withItems);
      mockRepo.updateStatusInTx.mockResolvedValue({
        ...mockStocktakingEntity,
        status: 'CONFIRMED',
      });

      await service.confirm(1, 'user-1');

      expect(mockStocksService.overwriteStock).toHaveBeenCalledTimes(1);
      expect(mockStocksService.overwriteStock).toHaveBeenCalledWith(
        expect.anything(),
        1,
        'prod-2',
        50,
        expect.anything(),
        'user-1',
        expect.any(String),
      );
    });

    it('DRAFT以外はBadRequestExceptionをスローすること', async () => {
      mockRepo.findByIdWithItems.mockResolvedValue({ ...mockStocktaking, status: 'CONFIRMED' });

      await expect(service.confirm(1, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithItems.mockResolvedValue(null);

      await expect(service.confirm(999, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
