import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ProductsRepository } from './products.repository';
import { PrismaService } from '../../../database/prisma.service';
import { FindProductsDto } from '../dto/find-products.dto';
import { makeProductEntity } from '@/__tests__/factories';

const mockProductWithRelations = makeProductEntity({
  id: 'p1',
  price: new Prisma.Decimal(1234.5),
  purchasePrice: new Prisma.Decimal(1000),
  unit: '個',
  stockQuantity: 50,
  createdBy: 'u1',
  creator: { id: 'u1', name: 'admin' },
});

const mockPrisma = {
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('ProductsRepository', () => {
  let repo: ProductsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<ProductsRepository>(ProductsRepository);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('id で findUnique を呼ぶ', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductWithRelations);
      await repo.findById('p1');
      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('findByIdWithRelations', () => {
    it('include で category/creator/updater を取得', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductWithRelations);
      await repo.findByIdWithRelations('p1');
      const call = mockPrisma.product.findUnique.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'p1' });
      expect(call.include).toHaveProperty('category');
      expect(call.include).toHaveProperty('creator');
      expect(call.include).toHaveProperty('updater');
    });
  });

  describe('findManyPaginated', () => {
    it('Decimal を number に変換し DTO shape で返す', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await repo.findManyPaginated({ page: 1, limit: 20 } as FindProductsDto);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(typeof result.data[0].price).toBe('number');
      expect(result.data[0].price).toBe(1234.5);
      expect(typeof result.data[0].purchasePrice).toBe('number');
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
      // Decimal が DTO に漏れていないこと
      expect(result.data[0]).not.toHaveProperty('price', expect.any(Prisma.Decimal));
    });

    it('search 指定時は OR 条件を組み立てる', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await repo.findManyPaginated({ search: 'PRD', page: 1, limit: 10 } as FindProductsDto);

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { name: { contains: 'PRD', mode: 'insensitive' } },
        { code: { contains: 'PRD', mode: 'insensitive' } },
      ]);
      expect(call.skip).toBe(0);
      expect(call.take).toBe(10);
    });

    it('不正な sort は createdAt にフォールバック', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await repo.findManyPaginated({
        sort: 'invalid_field',
        page: 1,
        limit: 20,
      } as FindProductsDto);

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('create / update / delete', () => {
    it('create は include 付きで呼ばれる', async () => {
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);
      const data = { code: 'PRD-001', name: 'x' } as Prisma.ProductCreateInput;
      await repo.create(data);
      const call = mockPrisma.product.create.mock.calls[0][0];
      expect(call.data).toBe(data);
      expect(call.include).toHaveProperty('category');
      expect(call.include).toHaveProperty('creator');
    });

    it('delete は where 条件のみで呼ばれる', async () => {
      mockPrisma.product.delete.mockResolvedValue(mockProductWithRelations);
      await repo.delete('p1');
      expect(mockPrisma.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('bulkUpsertByCode', () => {
    // $transaction(cb) 内で使われる tx クライアントを供給するヘルパ
    const setupTransaction = () => {
      const tx = {
        product: {
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    const baseRow = {
      code: 'PRD-001',
      name: '商品A',
      description: null,
      categoryId: 1,
      price: 100.5,
      purchasePrice: 80,
      unit: '個',
      status: 'ACTIVE' as const,
    };

    it('単一トランザクション内で全行を処理すること', async () => {
      const tx = setupTransaction();
      tx.product.findMany.mockResolvedValue([]);
      tx.product.create.mockResolvedValue({});

      await repo.bulkUpsertByCode([baseRow, { ...baseRow, code: 'PRD-002' }], 'user-1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('既存 code は update / 新規 code は create され、件数が返ること', async () => {
      const tx = setupTransaction();
      // PRD-001 は既存、PRD-002 は新規（事前一括 findMany で既存集合を取得）
      tx.product.findMany.mockResolvedValue([{ id: 'existing-1', code: 'PRD-001' }]);
      tx.product.update.mockResolvedValue({});
      tx.product.create.mockResolvedValue({});

      const result = await repo.bulkUpsertByCode(
        [baseRow, { ...baseRow, code: 'PRD-002' }],
        'user-1',
      );

      expect(result).toEqual({ created: 1, updated: 1 });
      expect(tx.product.update).toHaveBeenCalledTimes(1);
      expect(tx.product.create).toHaveBeenCalledTimes(1);
    });

    it('price / purchasePrice を Decimal に変換すること', async () => {
      const tx = setupTransaction();
      tx.product.findMany.mockResolvedValue([]);
      tx.product.create.mockResolvedValue({});

      await repo.bulkUpsertByCode([baseRow], 'user-1');

      const createArg = tx.product.create.mock.calls[0][0];
      expect(createArg.data.price).toBeInstanceOf(Prisma.Decimal);
      expect(createArg.data.price.toString()).toBe('100.5');
      expect(createArg.data.purchasePrice).toBeInstanceOf(Prisma.Decimal);
      expect(createArg.data.category).toEqual({ connect: { id: 1 } });
      expect(createArg.data.creator).toEqual({ connect: { id: 'user-1' } });
    });

    it('update 時に空欄（null）を明示送出してクリアすること', async () => {
      const tx = setupTransaction();
      tx.product.findMany.mockResolvedValue([{ id: 'existing-1', code: 'PRD-001' }]);
      tx.product.update.mockResolvedValue({});

      await repo.bulkUpsertByCode(
        [{ ...baseRow, description: null, purchasePrice: null, unit: null }],
        'user-1',
      );

      const updateArg = tx.product.update.mock.calls[0][0];
      expect(updateArg.data.description).toBeNull();
      expect(updateArg.data.purchasePrice).toBeNull();
      expect(updateArg.data.unit).toBeNull();
      expect(updateArg.data.updater).toEqual({ connect: { id: 'user-1' } });
    });

    it('トランザクション内のエラーは伝播し（rollback）件数を返さないこと', async () => {
      const tx = setupTransaction();
      tx.product.findMany.mockResolvedValue([]);
      tx.product.create.mockRejectedValue(new Error('DB error'));

      await expect(repo.bulkUpsertByCode([baseRow], 'user-1')).rejects.toThrow('DB error');
    });
  });
});
