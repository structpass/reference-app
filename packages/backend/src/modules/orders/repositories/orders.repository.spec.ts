import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { OrdersRepository } from './orders.repository';
import { PrismaService } from '../../../database/prisma.service';
import { FindOrdersDto } from '../dto/find-orders.dto';
import { makeOrderEntity, makeOrderItemEntity } from '@/__tests__/factories';

const mockOrderWithRelations = makeOrderEntity({
  orderNo: 'ORD-001',
  orderDate: new Date('2026-04-01'),
  supplierId: 10,
  desiredDeliveryDate: new Date('2026-04-10'),
  totalQty: 100,
  totalAmount: new Prisma.Decimal(99999.99),
  createdBy: 'u1',
  supplier: { id: 10, name: 'サプライヤA', code: 'SUP-001' },
  creator: { id: 'u1', name: 'admin' },
  items: [
    makeOrderItemEntity({
      productId: 'p1',
      orderQty: 10,
      unitPrice: new Prisma.Decimal(100),
      amount: new Prisma.Decimal(1000),
      product: { id: 'p1', name: '商品A', code: 'PRD-001', unit: '個' },
    }),
  ],
});

const mockPrisma = {
  order: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  orderItem: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// $transaction 内部で渡される TransactionClient の代用。tx-aware メソッドが
// tx 経由で正しいモデル操作を呼ぶことを検証する。
const mockTx = {
  order: { update: jest.fn() },
  orderItem: { deleteMany: jest.fn() },
};

describe('OrdersRepository', () => {
  let repo: OrdersRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<OrdersRepository>(OrdersRepository);
  });

  describe('findById', () => {
    it('deletedAt: null フィルタを適用', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrderWithRelations);
      await repo.findById(1);
      const call = mockPrisma.order.findFirst.mock.calls[0][0];
      expect(call.where).toEqual({ id: 1, deletedAt: null });
    });
  });

  describe('findByIdWithRelations', () => {
    it('items 込み + deletedAt: null で取得', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrderWithRelations);
      await repo.findByIdWithRelations(1);
      const call = mockPrisma.order.findFirst.mock.calls[0][0];
      expect(call.where).toEqual({ id: 1, deletedAt: null });
      expect(call.include).toHaveProperty('items');
      expect(call.include).toHaveProperty('supplier');
    });
  });

  describe('findManyPaginated', () => {
    it('Decimal を number に変換し items も DTO shape', async () => {
      mockPrisma.order.findMany.mockResolvedValue([mockOrderWithRelations]);
      mockPrisma.order.count.mockResolvedValue(1);

      const result = await repo.findManyPaginated({ page: 1, limit: 20 } as FindOrdersDto);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(typeof result.data[0].totalAmount).toBe('number');
      expect(result.data[0].totalAmount).toBe(99999.99);
      expect(result.data[0].items).toBeDefined();
      expect(typeof result.data[0].items![0].unitPrice).toBe('number');
      expect(result.data[0].items![0].unitPrice).toBe(100);
    });

    it('search 指定時は OR で orderNo / supplier.name を検索', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      await repo.findManyPaginated({ search: 'ORD', page: 1, limit: 20 } as FindOrdersDto);

      const call = mockPrisma.order.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.OR).toEqual([
        { orderNo: { contains: 'ORD', mode: 'insensitive' } },
        { supplier: { name: { contains: 'ORD', mode: 'insensitive' } } },
      ]);
    });
  });

  describe('softDelete', () => {
    it('deletedAt を設定して update する', async () => {
      mockPrisma.order.update.mockResolvedValue({
        ...mockOrderWithRelations,
        deletedAt: new Date(),
      });
      await repo.softDelete(1);
      const call = mockPrisma.order.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 1 });
      expect(call.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('deleteItemsInTx', () => {
    it('渡された tx 経由で orderId 指定の deleteMany を呼ぶ', async () => {
      mockTx.orderItem.deleteMany.mockResolvedValue({ count: 1 });
      await repo.deleteItemsInTx(mockTx as never, 1);
      expect(mockTx.orderItem.deleteMany).toHaveBeenCalledWith({ where: { orderId: 1 } });
      // 非 tx の prisma 側は呼ばれない（明細削除が tx 外に漏れていないこと: CODE-H1）
      expect(mockPrisma.orderItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('updateInTx', () => {
    it('渡された tx 経由で order.update を呼ぶ（明細 delete と同一 tx 前提）', async () => {
      mockTx.order.update.mockResolvedValue(mockOrderWithRelations);
      await repo.updateInTx(mockTx as never, 1, { status: 'ORDERED' });
      const call = mockTx.order.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 1 });
      expect(call.include).toHaveProperty('items');
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });
  });

  describe('runInTransaction', () => {
    it('prisma.$transaction にコールバックを委譲する', async () => {
      // 各テストで mockTx を貼り直す（resetMocks/restoreMocks で mockTx.orderItem.deleteMany 等の
      // 呼び出し履歴が剥がれない一方、deleteMany を 2 度呼ぶ別テストの混入が起きないよう初期化する）
      // （ref-0045＝cmn-0215 横展開）。
      const localMockTx = {
        order: { update: jest.fn().mockResolvedValue(mockOrderWithRelations) },
        orderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn(localMockTx),
      );
      const result = await repo.runInTransaction(async (tx) => {
        await repo.deleteItemsInTx(tx, 1);
        return repo.updateInTx(tx, 1, { status: 'ORDERED' });
      });
      // コールバックに渡る tx が delete / update 双方に共有される
      expect(localMockTx.orderItem.deleteMany).toHaveBeenCalledWith({ where: { orderId: 1 } });
      expect(localMockTx.order.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
