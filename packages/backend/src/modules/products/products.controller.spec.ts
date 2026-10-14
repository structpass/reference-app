import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ExcelService } from './excel.service';

const mockProductsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generateProductExcel: jest.fn(),
};

describe('ProductsController', () => {
  let controller: ProductsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: mockProductsService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);

    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('商品一覧を返すこと', async () => {
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };
      mockProductsService.findAll.mockResolvedValue(expected);

      const query = { page: 1, limit: 20 };
      const result = await controller.findAll(query as any);

      expect(result).toEqual(expected);
      expect(mockProductsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('商品詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 'uuid-1', name: 'テスト商品' } };
      mockProductsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('uuid-1');

      expect(result).toEqual(expected);
      expect(mockProductsService.findOne).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('create', () => {
    it('商品を作成して返すこと', async () => {
      const createDto = {
        code: 'PRD-001',
        name: '新商品',
        categoryId: 1,
        price: 1000,
        stockQuantity: 10,
      };
      const expected = { success: true, data: { id: 'uuid-new', ...createDto } };
      mockProductsService.create.mockResolvedValue(expected);

      const result = await controller.create(createDto, 'user-uuid-1');

      expect(result).toEqual(expected);
      expect(mockProductsService.create).toHaveBeenCalledWith(createDto, 'user-uuid-1');
    });
  });

  describe('update', () => {
    it('商品を更新して返すこと', async () => {
      const updateDto = { name: '更新商品' };
      const expected = { success: true, data: { id: 'uuid-1', name: '更新商品' } };
      mockProductsService.update.mockResolvedValue(expected);

      const result = await controller.update('uuid-1', updateDto, 'user-uuid-1');

      expect(result).toEqual(expected);
      expect(mockProductsService.update).toHaveBeenCalledWith('uuid-1', updateDto, 'user-uuid-1');
    });
  });

  describe('remove', () => {
    it('商品を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Product deleted successfully' } };
      mockProductsService.remove.mockResolvedValue(expected);

      const result = await controller.remove('uuid-1');

      expect(result).toEqual(expected);
      expect(mockProductsService.remove).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('exportExcel', () => {
    it('Excelファイルを生成してStreamableFileを返すこと', async () => {
      const products = [{ id: '1', name: 'テスト' }];
      const buffer = Buffer.from('excel-data');
      mockProductsService.findAllForExport.mockResolvedValue(products);
      mockExcelService.generateProductExcel.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockProductsService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generateProductExcel).toHaveBeenCalledWith(products);
    });
  });
});
