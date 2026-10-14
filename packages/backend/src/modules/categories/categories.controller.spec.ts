import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ExcelService } from '../../common/services/excel.service';

const mockCategoriesService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('CategoriesController', () => {
  let controller: CategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: mockCategoriesService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('カテゴリー一覧を返すこと', async () => {
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };
      mockCategoriesService.findAll.mockResolvedValue(expected);

      const query = { page: 1, limit: 20 };
      const result = await controller.findAll(query as any);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('カテゴリー詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, name: '電子機器' } };
      mockCategoriesService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('カテゴリーを作成して返すこと', async () => {
      const dto = { code: 'CAT-001', name: '電子機器' };
      const expected = { success: true, data: { id: 1, ...dto } };
      mockCategoriesService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('カテゴリーを更新して返すこと', async () => {
      const dto = { name: '更新カテゴリー' };
      const expected = { success: true, data: { id: 1, name: '更新カテゴリー' } };
      mockCategoriesService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('カテゴリーを削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Category deleted successfully' } };
      mockCategoriesService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1);

      expect(result).toEqual(expected);
      expect(mockCategoriesService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const categories = [
        {
          code: 'CAT-001',
          name: '電子機器',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockCategoriesService.findAllForExport.mockResolvedValue(categories);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockCategoriesService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        'カテゴリー一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスACTIVEが日本語「有効」に変換されること', async () => {
      const categories = [
        {
          code: 'CAT-001',
          name: '電子機器',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockCategoriesService.findAllForExport.mockResolvedValue(categories);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][2]).toBe('有効');
    });

    it('ステータスINACTIVEが日本語「無効」に変換されること', async () => {
      const categories = [
        {
          code: 'CAT-002',
          name: '食品',
          status: 'INACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockCategoriesService.findAllForExport.mockResolvedValue(categories);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][2]).toBe('無効');
    });

    it('マッピングにないステータスはそのまま使用されること', async () => {
      const categories = [
        {
          code: 'CAT-003',
          name: '雑貨',
          status: 'UNKNOWN_STATUS',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockCategoriesService.findAllForExport.mockResolvedValue(categories);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][2]).toBe('UNKNOWN_STATUS');
    });
  });
});
