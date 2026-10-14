import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { StocktakingsController } from './stocktakings.controller';
import { StocktakingsService } from './stocktakings.service';
import { ExcelService } from '../../common/services/excel.service';

const mockStocktakingsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  confirm: jest.fn(),
  remove: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('StocktakingsController', () => {
  let controller: StocktakingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StocktakingsController],
      providers: [
        { provide: StocktakingsService, useValue: mockStocktakingsService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<StocktakingsController>(StocktakingsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('棚卸一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockStocktakingsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockStocktakingsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('棚卸詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1 } };
      mockStocktakingsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockStocktakingsService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('棚卸を作成して返すこと', async () => {
      const dto = { warehouseId: 1, items: [] };
      const expected = { success: true, data: { id: 1 } };
      mockStocktakingsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockStocktakingsService.create).toHaveBeenCalledWith(dto, 'user-uuid');
    });
  });

  describe('update', () => {
    it('棚卸を更新して返すこと', async () => {
      const dto = { items: [] };
      const expected = { success: true, data: { id: 1 } };
      mockStocktakingsService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockStocktakingsService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('confirm', () => {
    it('棚卸を確定して返すこと（在庫上書き）', async () => {
      const expected = { success: true, data: { id: 1, status: 'CONFIRMED' } };
      mockStocktakingsService.confirm.mockResolvedValue(expected);

      const result = await controller.confirm(1, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockStocktakingsService.confirm).toHaveBeenCalledWith(1, 'user-uuid');
    });
  });

  describe('remove', () => {
    it('棚卸を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Stocktaking deleted' } };
      mockStocktakingsService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1);

      expect(result).toEqual(expected);
      expect(mockStocktakingsService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const stocktakings = [
        {
          id: 1,
          stocktakingDate: new Date('2026-03-17'),
          warehouseId: 1,
          stocktaker: '担当者A',
          status: 'DRAFT',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockStocktakingsService.findAllForExport.mockResolvedValue(stocktakings);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockStocktakingsService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        '棚卸一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスが日本語に変換されること', async () => {
      const stocktakings = [
        {
          id: 2,
          stocktakingDate: new Date('2026-03-17'),
          warehouseId: 1,
          stocktaker: null,
          status: 'CONFIRMED',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockStocktakingsService.findAllForExport.mockResolvedValue(stocktakings);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][4]).toBe('確定');
      expect(rows[0][3]).toBe('');
    });
  });
});
