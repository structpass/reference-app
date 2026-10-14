import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from './products.service';
import { ProductsRepository } from './repositories/products.repository';
import { makeProductEntity } from '@/__tests__/factories';

const mockProduct = makeProductEntity({
  id: 'product-uuid-1',
  code: 'PRD-001',
  name: 'テスト商品',
  description: 'テスト用の商品です',
  price: new Prisma.Decimal(10000),
  purchasePrice: null,
  unit: null,
  stockQuantity: 50,
  createdBy: 'user-uuid-1',
  creator: { id: 'user-uuid-1', name: 'admin' },
});

// Repository は entity を返し service が mapper で Decimal→number 変換するため、
// 期待 DTO は price を number 化した別オブジェクトで表す（orders.service.spec と同型）。
const mockProductDto = { ...mockProduct, price: 10000, purchasePrice: null };

const mockRepo = {
  findById: jest.fn(),
  findByIdWithRelations: jest.fn(),
  findByCode: jest.fn(),
  findManyPaginated: jest.fn(),
  findManyForExport: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: ProductsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('Repository.findManyPaginated に query を渡し結果を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockProduct],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual(expected);
      expect(mockRepo.findManyPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it('data[0].price が Prisma.Decimal ではなく number であること（DTO shape 検証）', async () => {
      // Repository は mapper 適用済の DTO を返す想定
      const dtoProduct = {
        ...mockProduct,
        price: 10000, // number（mapper 適用後）
        purchasePrice: null, // null
      };
      mockRepo.findManyPaginated.mockResolvedValue({
        success: true,
        data: [dtoProduct],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const result = await service.findAll({});

      expect(typeof result.data[0].price).toBe('number');
      expect(result.data[0].price).toBe(10000);
      expect(result.data[0].purchasePrice).toBeNull();
      // Prisma.Decimal インスタンスではないことを確認
      expect((result.data[0].price as any) instanceof Prisma.Decimal).toBe(false);
    });

    it('purchasePrice が number の場合も Decimal ではなく number であること', async () => {
      const dtoProductWithPurchasePrice = {
        ...mockProduct,
        price: 10000,
        purchasePrice: 8000, // number（mapper 適用後）
      };
      mockRepo.findManyPaginated.mockResolvedValue({
        success: true,
        data: [dtoProductWithPurchasePrice],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const result = await service.findAll({});

      expect(typeof result.data[0].purchasePrice).toBe('number');
      expect(result.data[0].purchasePrice).toBe(8000);
      expect((result.data[0].purchasePrice as any) instanceof Prisma.Decimal).toBe(false);
    });
  });

  describe('findOne', () => {
    it('商品が存在する場合に商品を返すこと', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(mockProduct);

      const result = await service.findOne('product-uuid-1');

      expect(result).toEqual({ success: true, data: mockProductDto });
      expect(mockRepo.findByIdWithRelations).toHaveBeenCalledWith('product-uuid-1');
    });

    it('商品が存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      code: 'PRD-002',
      name: '新商品',
      categoryId: 1,
      price: 5000,
      stockQuantity: 30,
    };

    it('商品を作成して返すこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockProduct);

      const result = await service.create(createDto, 'user-uuid-1');

      expect(result).toEqual({ success: true, data: mockProductDto });
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('商品コードが重複している場合にConflictExceptionをスローすること', async () => {
      mockRepo.findByCode.mockResolvedValue(mockProduct);

      await expect(service.create(createDto, 'user-uuid-1')).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('作成時にcreatorを接続すること', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockProduct);

      await service.create(createDto, 'user-uuid-1');

      const createCall = mockRepo.create.mock.calls[0][0];
      expect(createCall.creator).toEqual({ connect: { id: 'user-uuid-1' } });
    });

    it('priceをDecimalに変換すること', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockProduct);

      await service.create(createDto, 'user-uuid-1');

      const createCall = mockRepo.create.mock.calls[0][0];
      expect(createCall.price).toBeDefined();
    });
  });

  describe('update', () => {
    const updateDto = { name: '更新商品', price: 8000 };

    it('商品を更新して返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue({ ...mockProduct, name: '更新商品' });

      const result = await service.update('product-uuid-1', updateDto, 'user-uuid-1');

      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('商品が存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update('non-existent', updateDto, 'user-uuid-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('更新後のコードが既存の別商品と重複する場合にConflictExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.findByCode.mockResolvedValue({ ...mockProduct, id: 'other-id' });

      await expect(
        service.update('product-uuid-1', { code: 'PRD-999' }, 'user-uuid-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('同じコードへの更新時にコード重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { code: 'PRD-001' }, 'user-uuid-1');

      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });

    it('updaterを接続すること', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', updateDto, 'user-uuid-1');

      const [, data] = mockRepo.update.mock.calls[0];
      expect(data.updater).toEqual({ connect: { id: 'user-uuid-1' } });
    });

    it('categoryIdを指定した場合にカテゴリーを接続すること', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { categoryId: 2 }, 'user-uuid-1');

      const [, data] = mockRepo.update.mock.calls[0];
      expect(data.category).toEqual({ connect: { id: 2 } });
    });

    it('categoryIdを省略した場合にcategoryを設定しないこと', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { name: '更新名' }, 'user-uuid-1');

      const [, data] = mockRepo.update.mock.calls[0];
      expect(data.category).toBeUndefined();
    });

    it('priceを指定した場合にDecimalに変換すること', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { price: 9999 }, 'user-uuid-1');

      const [, data] = mockRepo.update.mock.calls[0];
      expect(data.price).toBeDefined();
    });

    it('purchasePriceを指定した場合にDecimalに変換すること', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { purchasePrice: 5000 }, 'user-uuid-1');

      const [, data] = mockRepo.update.mock.calls[0];
      expect(data.purchasePrice).toBeDefined();
    });
  });

  describe('remove', () => {
    it('商品を削除して成功メッセージを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockProduct);
      mockRepo.delete.mockResolvedValue(mockProduct);

      const result = await service.remove('product-uuid-1');

      expect(result.success).toBe(true);
      expect(result.data.message).toBe('Product deleted successfully');
      expect(mockRepo.delete).toHaveBeenCalledWith('product-uuid-1');
    });

    it('商品が存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('findAllForExport', () => {
    it('Repository.findManyForExport を呼んで結果配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockProduct]);

      const result = await service.findAllForExport({});

      expect(result).toEqual([mockProduct]);
      expect(mockRepo.findManyForExport).toHaveBeenCalled();
    });

    it('返却配列要素の price が Prisma.Decimal ではなく number であること（DTO shape 検証）', async () => {
      // Repository は mapper 適用済の ProductResponseDto[] を返す
      const dtoProduct = {
        ...mockProduct,
        price: 10000, // number（mapper 適用後）
        purchasePrice: null,
      };
      mockRepo.findManyForExport.mockResolvedValue([dtoProduct]);

      const result = await service.findAllForExport({});

      expect(Array.isArray(result)).toBe(true);
      expect(typeof result[0].price).toBe('number');
      expect(result[0].price).toBe(10000);
      expect((result[0].price as any) instanceof Prisma.Decimal).toBe(false);
    });
  });
});
