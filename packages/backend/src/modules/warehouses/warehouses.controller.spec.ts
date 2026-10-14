import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { ExcelService } from '../../common/services/excel.service';

const mockWarehousesService = {
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

describe('WarehousesController', () => {
  let controller: WarehousesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WarehousesController],
      providers: [
        { provide: WarehousesService, useValue: mockWarehousesService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<WarehousesController>(WarehousesController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('倉庫一覧を返すこと', async () => {
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };
      mockWarehousesService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockWarehousesService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('倉庫詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, name: 'テスト倉庫' } };
      mockWarehousesService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockWarehousesService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('倉庫を作成して返すこと', async () => {
      const dto = { code: 'WH-001', name: '新倉庫' };
      const expected = { success: true, data: { id: 1, ...dto } };
      mockWarehousesService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(result).toEqual(expected);
      expect(mockWarehousesService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('倉庫を更新して返すこと', async () => {
      const dto = { name: '更新倉庫' };
      const expected = { success: true, data: { id: 1, name: '更新倉庫' } };
      mockWarehousesService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockWarehousesService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('倉庫を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Warehouse deleted' } };
      mockWarehousesService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1);

      expect(result).toEqual(expected);
      expect(mockWarehousesService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const warehouses = [
        {
          code: 'WH-001',
          name: 'テスト倉庫',
          address: '東京都',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockWarehousesService.findAllForExport.mockResolvedValue(warehouses);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockWarehousesService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        '倉庫一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスが日本語に変換されること', async () => {
      const warehouses = [
        {
          code: 'WH-001',
          name: 'テスト',
          address: null,
          status: 'INACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockWarehousesService.findAllForExport.mockResolvedValue(warehouses);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][3]).toBe('無効');
      expect(rows[0][2]).toBe('');
    });
  });
});
