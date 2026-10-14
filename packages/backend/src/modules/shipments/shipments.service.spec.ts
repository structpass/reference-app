import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { ShipmentsRepository } from './repositories/shipments.repository';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { StocksService } from '../stocks/stocks.service';
import { makeShipmentEntity } from '@/__tests__/factories';

const _shipmentOverrides = {
  shipmentNo: 'SHP-20260316-0001',
  shipmentDate: new Date('2026-03-16'),
  warehouseId: 1,
  destination: '東京配送センター',
  carrierId: 1,
  warehouse: { id: 1, name: '倉庫A', code: 'WH-001' },
  carrier: { id: 1, name: '運送会社A', code: 'CR-001' },
  lines: [],
};

// Entity-shape mock (what updateStatusInTx returns — Prisma entity with relations)
const mockShipmentEntity = makeShipmentEntity(_shipmentOverrides);

// DTO-shape mock (what repository DTO-path methods return after mapper)
const mockShipmentDto = makeShipmentEntity(_shipmentOverrides);

// Legacy alias for tests needing plain entity shape (findById / findByIdWithLines path)
const mockShipment = mockShipmentEntity;

// 単一トランザクション境界の検証用 sentinel。runInTransaction が渡す tx と
// deleteLinesInTx / updateInTx が受け取る tx が同一であることを assert するために使う。
const mockTx = { __tx: 'shipments' };

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
  generateShipmentNo: jest.fn().mockResolvedValue('SHP-20260316-0001'),
};

const mockStocksService = {
  adjustStock: jest.fn(),
};

describe('ShipmentsService', () => {
  let service: ShipmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipmentsService,
        { provide: ShipmentsRepository, useValue: mockRepo },
        { provide: DocumentNumberService, useValue: mockDocumentNumberService },
        { provide: StocksService, useValue: mockStocksService },
      ],
    }).compile();

    service = module.get<ShipmentsService>(ShipmentsService);
    jest.clearAllMocks();
    mockDocumentNumberService.generateShipmentNo.mockResolvedValue('SHP-20260316-0001');
    mockRepo.runInTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockTx),
    );
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('PaginatedResponse<ShipmentWithRelationsResponseDto> shape を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockShipmentDto],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
      const item = result.data[0];
      expect(item).toHaveProperty('id', 1);
      expect(item).toHaveProperty('shipmentNo', 'SHP-20260316-0001');
      expect(item).toHaveProperty('destination', '東京配送センター');
      expect(item).toHaveProperty('warehouse');
      expect(item).toHaveProperty('carrier');
    });
  });

  describe('findAllForExport', () => {
    it('DTO 配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockShipmentDto]);

      const result = await service.findAllForExport({});

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('shipmentNo', 'SHP-20260316-0001');
      expect(result[0]).toHaveProperty('destination');
    });
  });

  describe('findOne', () => {
    it('SingleResponse<ShipmentWithRelationsResponseDto> shape を返すこと', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(mockShipmentDto);

      const result = await service.findOne(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('shipmentNo', 'SHP-20260316-0001');
      expect(result.data).toHaveProperty('warehouseId', 1);
      expect(result.data).toHaveProperty('destination', '東京配送センター');
      expect(result.data).toHaveProperty('warehouse');
      expect(result.data).toHaveProperty('carrier');
      expect(result.data).toHaveProperty('creator');
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('DTO shape を返すこと', async () => {
      mockRepo.create.mockResolvedValue(mockShipmentDto);

      const result = await service.create(
        {
          shipmentDate: '2026-03-16',
          warehouseId: 1,
          destination: '東京配送センター',
          carrierId: 1,
          lines: [{ lineNo: 1, productId: 'prod-1', plannedQty: 10, actualQty: 10 }],
        },
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('shipmentNo', 'SHP-20260316-0001');
      expect(result.data).toHaveProperty('warehouse');
      expect(mockDocumentNumberService.generateShipmentNo).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('DRAFT状態の出荷を更新しDTO shape を返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockShipmentEntity);
      mockRepo.updateInTx.mockResolvedValue(mockShipmentEntity);

      const result = await service.update(1, { destination: '大阪倉庫' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('warehouse');
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, { destination: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('DRAFT以外の場合にBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockShipment, status: 'CONFIRMED' });

      await expect(service.update(1, { destination: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('明細行を置き換えること', async () => {
      mockRepo.findById.mockResolvedValue(mockShipment);
      mockRepo.deleteLinesInTx.mockResolvedValue({ count: 0 });
      mockRepo.updateInTx.mockResolvedValue(mockShipment);

      await service.update(1, {
        lines: [{ lineNo: 1, productId: 'prod-1', plannedQty: 20, actualQty: 20 }],
      });

      expect(mockRepo.deleteLinesInTx).toHaveBeenCalledWith(mockTx, 1);
    });

    it('明細置換が単一トランザクション内で実行されること（CODE-H1: delete と update が同一 tx）', async () => {
      mockRepo.findById.mockResolvedValue(mockShipment);
      mockRepo.deleteLinesInTx.mockResolvedValue({ count: 0 });
      mockRepo.updateInTx.mockResolvedValue(mockShipment);

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
      mockRepo.findById.mockResolvedValue(mockShipment);
      mockRepo.updateInTx.mockResolvedValue(mockShipment);

      await service.update(1, { destination: '大阪倉庫' });

      expect(mockRepo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(mockRepo.deleteLinesInTx).not.toHaveBeenCalled();
      expect(mockRepo.updateInTx).toHaveBeenCalledWith(mockTx, 1, expect.any(Object));
    });
  });

  describe('confirm', () => {
    it('DRAFT出荷を確定しDTO shape を返すこと', async () => {
      const withLines = {
        ...mockShipmentEntity,
        lines: [{ productId: 'prod-1', actualQty: 10, plannedQty: 10 }],
      };
      mockRepo.findByIdWithLines.mockResolvedValue(withLines);
      mockRepo.updateStatusInTx.mockResolvedValue({ ...mockShipmentEntity, status: 'CONFIRMED' });
      mockStocksService.adjustStock.mockResolvedValue({ quantityBefore: 100, quantityAfter: 90 });

      const result = await service.confirm(1, 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', 1);
      expect(result.data).toHaveProperty('status', 'CONFIRMED');
      expect(result.data).toHaveProperty('warehouse');
      expect(result.data).toHaveProperty('carrier');
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

    it('actualQtyがnullの場合にplannedQtyを使用すること', async () => {
      const withLines = {
        ...mockShipmentEntity,
        lines: [{ productId: 'prod-1', actualQty: null, plannedQty: 15 }],
      };
      mockRepo.findByIdWithLines.mockResolvedValue(withLines);
      mockRepo.updateStatusInTx.mockResolvedValue({ ...mockShipmentEntity, status: 'CONFIRMED' });
      mockStocksService.adjustStock.mockResolvedValue({ quantityBefore: 100, quantityAfter: 85 });

      await service.confirm(1, 'user-1');

      expect(mockStocksService.adjustStock).toHaveBeenCalledWith(
        expect.anything(),
        1,
        'prod-1',
        -15,
        expect.anything(),
        'user-1',
        expect.any(String),
      );
    });

    it('在庫不足の場合に警告を返すこと', async () => {
      const withLines = {
        ...mockShipmentEntity,
        lines: [{ productId: 'prod-1', actualQty: 10, plannedQty: 10 }],
      };
      mockRepo.findByIdWithLines.mockResolvedValue(withLines);
      mockRepo.updateStatusInTx.mockResolvedValue({ ...mockShipmentEntity, status: 'CONFIRMED' });
      // ロック取得後の quantityBefore(5) が出荷数(10) を下回るため在庫不足警告（CODE-H2）
      mockStocksService.adjustStock.mockResolvedValue({ quantityBefore: 5, quantityAfter: -5 });

      const result = await service.confirm(1, 'user-1');

      expect(result.warnings).toBeDefined();
      expect(result.warnings).toHaveLength(1);
    });

    it('DRAFT以外はBadRequestExceptionをスローすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue({ ...mockShipment, status: 'CONFIRMED' });

      await expect(service.confirm(1, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue(null);

      await expect(service.confirm(999, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ship', () => {
    it('CONFIRMED出荷をSHIPPEDに変更すること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockShipment, status: 'CONFIRMED' });
      mockRepo.updateStatus.mockResolvedValue({ ...mockShipment, status: 'SHIPPED' });

      const result = await service.ship(1);

      expect(result.success).toBe(true);
    });

    it('CONFIRMED以外はBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockShipment);

      await expect(service.ship(1)).rejects.toThrow(BadRequestException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.ship(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('DRAFT出荷をソフトデリートすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue({ ...mockShipment, lines: [] });
      mockRepo.softDelete.mockResolvedValue(mockShipment);

      const result = await service.remove(1, 'user-1');

      expect(result).toEqual({
        success: true,
        data: { message: 'Shipment deleted successfully' },
      });
      expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('CONFIRMED出荷の取消で在庫を戻すこと', async () => {
      const confirmed = {
        ...mockShipment,
        status: 'CONFIRMED',
        lines: [{ productId: 'prod-1', actualQty: 10 }],
      };
      mockRepo.findByIdWithLines.mockResolvedValue(confirmed);
      mockRepo.softDeleteInTx.mockResolvedValue(mockShipment);

      await service.remove(1, 'user-1');

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

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithLines.mockResolvedValue(null);

      await expect(service.remove(999, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
