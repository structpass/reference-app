import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './repositories/orders.repository';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { makeOrderEntity, BASE_DATE } from '@/__tests__/factories';

const mockOrder = makeOrderEntity({ supplier: null });

const mockOrderDto = {
  id: 1,
  orderNo: 'PO-20260316-001',
  orderDate: new Date('2026-03-16'),
  supplierId: 1,
  desiredDeliveryDate: null,
  totalQty: 10,
  totalAmount: 5000,
  status: 'DRAFT',
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  creator: { id: 'user-1', name: 'admin' },
  supplier: undefined,
  items: [
    {
      id: 1,
      orderId: 1,
      lineNo: 1,
      productId: 'prod-1',
      orderQty: 10,
      unitPrice: 500,
      amount: 5000,
      product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
    },
  ],
};

// 単一トランザクション検証用の tx センチネル（同一性アサート用）
const mockTx = { __tx: 'orders' };

/**
 * resetMocks/restoreMocks 環境では jest.fn() 関数そのものが剥がれる。OrdersService は create() で
 * this.repo を直接参照するため、provide の参照を beforeEach で貼り直さないと前のテストで残った
 * mock が次のテストへ漏れる（ref-0045＝cmn-0215 の横展開）。
 */
let mockRepo: {
  findById: jest.Mock;
  findByIdWithRelations: jest.Mock;
  findManyPaginated: jest.Mock;
  findManyForExport: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateInTx: jest.Mock;
  softDelete: jest.Mock;
  deleteItemsInTx: jest.Mock;
  runInTransaction: jest.Mock;
};

const mockDocumentNumberService = {
  generateOrderNo: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    mockRepo = {
      findById: jest.fn(),
      findByIdWithRelations: jest.fn(),
      findManyPaginated: jest.fn(),
      findManyForExport: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateInTx: jest.fn(),
      softDelete: jest.fn(),
      deleteItemsInTx: jest.fn(),
      runInTransaction: jest.fn(),
    };
    // runInTransaction の既定実装は「cb を mockTx で呼んで返す」（CODE-H1 系の tx 検証用）。
    mockRepo.runInTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockTx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrdersRepository, useValue: mockRepo },
        { provide: DocumentNumberService, useValue: mockDocumentNumberService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    // resetMocks/restoreMocks で剥がれた generateOrderNo の既定値をここで張り直す（ref-0045）。
    mockDocumentNumberService.generateOrderNo.mockResolvedValue('PO-20260316-001');
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('Repository.findManyPaginated に委譲すること', async () => {
      const expected = {
        success: true,
        data: [mockOrderDto],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual(expected);
      expect(mockRepo.findManyPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it('data[0].totalAmount が Prisma.Decimal ではなく number | null であること（DTO shape 検証）', async () => {
      // Repository は findManyPaginated 内で toOrderResponse を通した DTO を返す
      mockRepo.findManyPaginated.mockResolvedValue({
        success: true,
        data: [mockOrderDto],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const result = await service.findAll({});

      expect(typeof result.data[0].totalAmount).toBe('number');
      expect(result.data[0].totalAmount).toBe(5000);
      expect((result.data[0].totalAmount as any) instanceof Prisma.Decimal).toBe(false);
    });

    it('data[0].items[0].unitPrice が Prisma.Decimal ではなく number であること（DTO shape 検証）', async () => {
      mockRepo.findManyPaginated.mockResolvedValue({
        success: true,
        data: [mockOrderDto],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const result = await service.findAll({});

      expect(typeof result.data[0].items![0].unitPrice).toBe('number');
      expect(result.data[0].items![0].unitPrice).toBe(500);
      expect((result.data[0].items![0].unitPrice as any) instanceof Prisma.Decimal).toBe(false);
    });
  });

  describe('findAllForExport', () => {
    it('Repository.findManyForExport に委譲すること', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockOrderDto]);

      const result = await service.findAllForExport({});

      expect(result).toEqual([mockOrderDto]);
    });

    it('返却配列要素の totalAmount が Prisma.Decimal ではなく number | null であること（DTO shape 検証）', async () => {
      // Repository は findManyForExport 内で toOrderResponse を通した OrderResponseDto[] を返す
      mockRepo.findManyForExport.mockResolvedValue([mockOrderDto]);

      const result = await service.findAllForExport({});

      expect(Array.isArray(result)).toBe(true);
      expect(typeof result[0].totalAmount).toBe('number');
      expect(result[0].totalAmount).toBe(5000);
      expect((result[0].totalAmount as any) instanceof Prisma.Decimal).toBe(false);
    });

    it('返却配列要素の items[0].unitPrice が Prisma.Decimal ではなく number であること（DTO shape 検証）', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockOrderDto]);

      const result = await service.findAllForExport({});

      expect(typeof result[0].items![0].unitPrice).toBe('number');
      expect(result[0].items![0].unitPrice).toBe(500);
      expect((result[0].items![0].unitPrice as any) instanceof Prisma.Decimal).toBe(false);
    });
  });

  describe('findOne', () => {
    it('存在する場合にデータを返すこと', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(mockOrder);

      const result = await service.findOne(1);

      expect(result).toEqual({ success: true, data: mockOrderDto });
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('発注伝票を作成すること', async () => {
      mockRepo.create.mockResolvedValue(mockOrder);

      const result = await service.create(
        {
          orderDate: '2026-03-16',
          supplierId: 1,
          items: [{ lineNo: 1, productId: 'prod-1', orderQty: 10, unitPrice: 500 }],
        },
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(mockDocumentNumberService.generateOrderNo).toHaveBeenCalled();
    });

    it('戻り値 data.totalAmount が Decimal ではなく number であること（DTO 変換）', async () => {
      mockRepo.create.mockResolvedValue(mockOrder);

      const result = await service.create(
        {
          orderDate: '2026-03-16',
          supplierId: 1,
          items: [{ lineNo: 1, productId: 'prod-1', orderQty: 10, unitPrice: 500 }],
        },
        'user-1',
      );

      expect(typeof result.data.totalAmount).toBe('number');
      expect(result.data.totalAmount).toBe(5000);
    });

    it('戻り値 data.items[0].unitPrice / amount が number であること（DTO 変換）', async () => {
      mockRepo.create.mockResolvedValue(mockOrder);

      const result = await service.create(
        {
          orderDate: '2026-03-16',
          supplierId: 1,
          items: [{ lineNo: 1, productId: 'prod-1', orderQty: 10, unitPrice: 500 }],
        },
        'user-1',
      );

      expect(typeof result.data.items![0].unitPrice).toBe('number');
      expect(result.data.items![0].unitPrice).toBe(500);
      expect(typeof result.data.items![0].amount).toBe('number');
      expect(result.data.items![0].amount).toBe(5000);
    });

    it('totalQtyとtotalAmountを正しく計算すること', async () => {
      mockRepo.create.mockResolvedValue(mockOrder);

      await service.create(
        {
          orderDate: '2026-03-16',
          supplierId: 1,
          items: [
            { lineNo: 1, productId: 'prod-1', orderQty: 5, unitPrice: 100 },
            { lineNo: 2, productId: 'prod-2', orderQty: 3, unitPrice: 200 },
          ],
        },
        'user-1',
      );

      const createCall = mockRepo.create.mock.calls[0][0];
      expect(createCall.totalQty).toBe(8);
      expect(createCall.totalAmount.toNumber()).toBe(1100);
    });
  });

  describe('update', () => {
    it('DRAFT状態の発注を更新すること', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.updateInTx.mockResolvedValue(mockOrder);

      const result = await service.update(1, { supplierId: 2 });

      expect(result.success).toBe(true);
    });

    it('戻り値 data.totalAmount が Decimal ではなく number であること（DTO 変換）', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.updateInTx.mockResolvedValue(mockOrder);

      const result = await service.update(1, { supplierId: 2 });

      expect(typeof result.data.totalAmount).toBe('number');
      expect(result.data.totalAmount).toBe(5000);
      expect(typeof result.data.items![0].unitPrice).toBe('number');
      expect(result.data.items![0].unitPrice).toBe(500);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, { supplierId: 2 })).rejects.toThrow(NotFoundException);
    });

    it('DRAFT以外の場合にBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockOrder, status: 'ORDERED' });

      await expect(service.update(1, { supplierId: 2 })).rejects.toThrow(BadRequestException);
    });

    it('明細行を置き換えること', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.deleteItemsInTx.mockResolvedValue({ count: 1 });
      mockRepo.updateInTx.mockResolvedValue(mockOrder);

      await service.update(1, {
        items: [{ lineNo: 1, productId: 'prod-1', orderQty: 20, unitPrice: 500 }],
      });

      expect(mockRepo.deleteItemsInTx).toHaveBeenCalledWith(mockTx, 1);
    });

    it('明細置換が単一トランザクション内で実行されること（CODE-H1: delete と update が同一 tx）', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.deleteItemsInTx.mockResolvedValue({ count: 1 });
      mockRepo.updateInTx.mockResolvedValue(mockOrder);

      await service.update(1, {
        items: [{ lineNo: 1, productId: 'prod-1', orderQty: 20, unitPrice: 500 }],
      });

      // runInTransaction 経由で deleteItemsInTx → updateInTx が同一 tx に対して実行される
      expect(mockRepo.runInTransaction).toHaveBeenCalledTimes(1);
      const deleteTx = mockRepo.deleteItemsInTx.mock.calls[0][0];
      const updateTx = mockRepo.updateInTx.mock.calls[0][0];
      expect(deleteTx).toBe(mockTx);
      expect(updateTx).toBe(mockTx);
      expect(deleteTx).toBe(updateTx);
    });

    it('明細を変更しない場合でも update は tx 内で実行されること', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.updateInTx.mockResolvedValue(mockOrder);

      await service.update(1, { supplierId: 2 });

      expect(mockRepo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(mockRepo.updateInTx).toHaveBeenCalledWith(mockTx, 1, expect.any(Object));
      expect(mockRepo.deleteItemsInTx).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('発注をソフトデリートすること', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.softDelete.mockResolvedValue(mockOrder);

      const result = await service.remove(1);

      expect(result).toEqual({
        success: true,
        data: { message: 'Order deleted successfully' },
      });
      expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm', () => {
    it('DRAFT発注をORDEREDに変更すること', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.update.mockResolvedValue({ ...mockOrder, status: 'ORDERED' });

      const result = await service.confirm(1);

      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(1, { status: 'ORDERED' });
    });

    it('戻り値 data.status が ORDERED かつ totalAmount が number であること（DTO 変換）', async () => {
      mockRepo.findById.mockResolvedValue(mockOrder);
      mockRepo.update.mockResolvedValue({ ...mockOrder, status: 'ORDERED' });

      const result = await service.confirm(1);

      expect(result.data.status).toBe('ORDERED');
      expect(typeof result.data.totalAmount).toBe('number');
      expect(result.data.totalAmount).toBe(5000);
      expect(typeof result.data.items![0].unitPrice).toBe('number');
    });

    it('DRAFT以外はBadRequestExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockOrder, status: 'ORDERED' });

      await expect(service.confirm(1)).rejects.toThrow(BadRequestException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.confirm(999)).rejects.toThrow(NotFoundException);
    });
  });
});
