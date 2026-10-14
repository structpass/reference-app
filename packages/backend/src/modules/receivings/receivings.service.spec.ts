import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReceivingsService } from './receivings.service';
import { ReceivingsRepository } from './repositories/receivings.repository';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { StocksService } from '../stocks/stocks.service';
import { makeReceivingEntity } from '@/__tests__/factories';

const _receivingOverrides = {
  receivingNo: 'RCV-20260316-0001',
  receivingDate: new Date('2026-03-16'),
  warehouseId: 1,
  supplierId: 1,
  warehouse: { id: 1, name: '倉庫A', code: 'WH-001' },
  supplier: { id: 1, name: '仕入先A', code: 'SUP-001' },
  lines: [],
};

// Entity-shape mock (what updateStatusInTx returns — Prisma entity with relations)
const mockReceivingEntity = makeReceivingEntity(_receivingOverrides);

// DTO-shape mock (what repository DTO-path methods return after mapper)
const mockReceivingDto = makeReceivingEntity(_receivingOverrides);

// 単一トランザクション検証用の tx センチネル（同一性アサート用）
const mockTx = { __tx: 'receivings' };

const mockRepo = {
  findById: jest.fn(),
  findByIdWithLines: jest.fn(),
  findByIdWithRelations: jest.fn(),
  findManyPaginated: jest.fn(),
  findManyForExport: jest.fn(),
  create: jest.fn(),
  updateInTx: jest.fn(),
  updateStatus: jest.fn(),
  updateStatusInTx: jest.fn(),
  softDelete: jest.fn(),
  softDeleteInTx: jest.fn(),
  deleteLinesInTx: jest.fn(),
  runInTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
};

const mockDocumentNumberService = {
  generateReceivingNo: jest.fn().mockResolvedValue('RCV-20260316-0001'),
};

const mockStocksService = {
  adjustStock: jest.fn(),
};

describe('ReceivingsService', () => {
  let service: ReceivingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceivingsService,
        { provide: ReceivingsRepository, useValue: mockRepo },
        { provide: DocumentNumberService, useValue: mockDocumentNumberService },
        { provide: StocksService, useValue: mockStocksService },
      ],
    }).compile();

    service = module.get<ReceivingsService>(ReceivingsService);
    jest.clearAllMocks();
    mockDocumentNumberService.generateReceivingNo.mockResolvedValue('RCV-20260316-0001');
    mockRepo.runInTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockTx),
    );
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('PaginatedResponse<ReceivingWithRelationsResponseDto> shape を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockReceivingDto],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
      const item = result.data[0];
      expect(item).toHaveProperty('id', 1);
      expect(item).toHaveProperty('receivingNo', 'RCV-20260316-0001');
      expect(item).toHaveProperty('status', 'DRAFT');
      expect(item).toHaveProperty('warehouse');
      expect(item).toHaveProperty('supplier');
    });
  });

  describe('findAllForExport', () => {
    it('DTO 配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockReceivingDto]);

      const result = await service.findAllForExport({});

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('receivingNo', 'RCV-20260316-0001');
      expect(result[0]).toHaveProperty('warehouse');
      expect(result[0]).toHaveProperty('supplier');
    });
  });

  describe('findOne', () => {
    it('SingleResponse<ReceivingWithRelationsResponseDto> shape を返すこと', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(mockReceivingDto);

      const result = await service.findOne(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('receivingNo', 'RCV-20260316-0001');
      expect(result.data).toHaveProperty('warehouseId', 1);
      expect(result.data).toHaveProperty('supplierId', 1);
      expect(result.data).toHaveProperty('warehouse');
      expect(result.data).toHaveProperty('supplier');
      expect(result.data).toHaveProperty('creator');
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('DTO shape を返すこと', async () => {
      mockRepo.create.mockResolvedValue(mockReceivingDto);

      const result = await service.create(
        {
          receivingDate: '2026-03-16',
          warehouseId: 1,
          supplierId: 1,
          lines: [{ lineNo: 1, productId: 'prod-1', plannedQty: 10, actualQty: 10 }],
        },
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('receivingNo', 'RCV-20260316-0001');
      expect(result.data).toHaveProperty('warehouse');
      expect(mockDocumentNumberService.generateReceivingNo).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('DRAFT状態の入荷を更新しDTO shape を返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockReceivingEntity);
      mockRepo.updateInTx.mockResolvedValue(mockReceivingEntity);

      const result = await service.update(1, { supplierId: 2 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('warehouse');
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, { supplierId: 2 })).rejects.toThrow(NotFoundException);
    });

    it('DRAFT以外の場合にBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockReceivingEntity, status: 'CONFIRMED' });

      await expect(service.update(1, { supplierId: 2 })).rejects.toThrow(BadRequestException);
    });

    it('明細行を置き換えること', async () => {
      mockRepo.findById.mockResolvedValue(mockReceivingEntity);
      mockRepo.deleteLinesInTx.mockResolvedValue({ count: 0 });
      mockRepo.updateInTx.mockResolvedValue(mockReceivingEntity);

      await service.update(1, {
        lines: [{ lineNo: 1, productId: 'prod-1', plannedQty: 20, actualQty: 20 }],
      });

      expect(mockRepo.deleteLinesInTx).toHaveBeenCalledWith(mockTx, 1);
    });

    it('明細置換が単一トランザクション内で実行されること（CODE-H1: delete と update が同一 tx）', async () => {
      mockRepo.findById.mockResolvedValue(mockReceivingEntity);
      mockRepo.deleteLinesInTx.mockResolvedValue({ count: 0 });
      mockRepo.updateInTx.mockResolvedValue(mockReceivingEntity);

      await service.update(1, {
        lines: [{ lineNo: 1, productId: 'prod-1', plannedQty: 20, actualQty: 20 }],
      });

      expect(mockRepo.runInTransaction).toHaveBeenCalledTimes(1);
      const deleteTx = mockRepo.deleteLinesInTx.mock.calls[0][0];
      const updateTx = mockRepo.updateInTx.mock.calls[0][0];
      expect(deleteTx).toBe(mockTx);
      expect(updateTx).toBe(mockTx);
      expect(deleteTx).toBe(updateTx);
    });

    it('明細を変更しない場合でも update は tx 内で実行されること（CODE-H1）', async () => {
      mockRepo.findById.mockResolvedValue(mockReceivingEntity);
      mockRepo.updateInTx.mockResolvedValue(mockReceivingEntity);

      await service.update(1, { supplierId: 2 });

      expect(mockRepo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(mockRepo.deleteLinesInTx).not.toHaveBeenCalled();
      expect(mockRepo.updateInTx).toHaveBeenCalledWith(mockTx, 1, expect.any(Object));
    });
  });

  describe('confirm', () => {
    it('DRAFT入荷を確定しDTO shape を返すこと', async () => {
      const withLines = {
        ...mockReceivingEntity,
        lines: [{ productId: 'prod-1', actualQty: 10, plannedQty: 10 }],
      };
      mockRepo.findByIdWithLines.mockResolvedValue(withLines);
      mockRepo.updateStatusInTx.mockResolvedValue({ ...mockReceivingEntity, status: 'CONFIRMED' });

      const result = await service.confirm(1, 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('status', 'CONFIRMED');
      expect(result.data).toHaveProperty('warehouse');
      expect(result.data).toHaveProperty('supplier');
      expect(mockStocksService.adjustStock).toHaveBeenCalledWith(
        expect.anything(),
        1,
        'prod-1',
        10,
        expect.anything(),
        'user-1',
        expect.any(String),
      );
    });

    it('actualQtyがnullの場合にplannedQtyを使用すること', async () => {
      const withLines = {
        ...mockReceivingEntity,
        lines: [{ productId: 'prod-1', actualQty: null, plannedQty: 15 }],
      };
      mockRepo.findByIdWithLines.mockResolvedValue(withLines);
      mockRepo.updateStatusInTx.mockResolvedValue({ ...mockReceivingEntity, status: 'CONFIRMED' });

      await service.confirm(1, 'user-1');

      expect(mockStocksService.adjustStock).toHaveBeenCalledWith(
        expect.anything(),
        1,
        'prod-1',
        15,
        expect.anything(),
        'user-1',
        expect.any(String),
      );
    });

    it('DRAFT以外はBadRequestExceptionをスローすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue({ ...mockReceivingEntity, status: 'CONFIRMED' });

      await expect(service.confirm(1, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue(null);

      await expect(service.confirm(999, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('complete', () => {
    it('CONFIRMED入荷を完了しDTO shape を返すこと', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockReceivingEntity, status: 'CONFIRMED' });
      mockRepo.updateStatus.mockResolvedValue({ ...mockReceivingDto, status: 'COMPLETED' });

      const result = await service.complete(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('status', 'COMPLETED');
    });

    it('CONFIRMED以外はBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockReceivingEntity);

      await expect(service.complete(1)).rejects.toThrow(BadRequestException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.complete(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('DRAFT入荷をソフトデリートすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue({ ...mockReceivingEntity, lines: [] });
      mockRepo.softDelete.mockResolvedValue(mockReceivingEntity);

      const result = await service.remove(1, 'user-1');

      expect(result).toEqual({
        success: true,
        data: { message: 'Receiving deleted successfully' },
      });
      expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('CONFIRMED入荷を取消し在庫を戻すこと', async () => {
      const confirmed = {
        ...mockReceivingEntity,
        status: 'CONFIRMED',
        lines: [{ productId: 'prod-1', actualQty: 10 }],
      };
      mockRepo.findByIdWithLines.mockResolvedValue(confirmed);
      mockRepo.softDeleteInTx.mockResolvedValue(mockReceivingEntity);

      await service.remove(1, 'user-1');

      expect(mockStocksService.adjustStock).toHaveBeenCalledWith(
        expect.anything(),
        1,
        'prod-1',
        -10,
        expect.anything(),
        'user-1',
        expect.any(String),
      );
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue(null);

      await expect(service.remove(999, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
