import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { ExcelService } from '../../common/services/excel.service';

const mockSuppliersService = {
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

describe('SuppliersController', () => {
  let controller: SuppliersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [
        { provide: SuppliersService, useValue: mockSuppliersService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<SuppliersController>(SuppliersController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('仕入先一覧を返すこと', async () => {
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };
      mockSuppliersService.findAll.mockResolvedValue(expected);

      const query = { page: 1, limit: 20 };
      const result = await controller.findAll(query as any);

      expect(result).toEqual(expected);
      expect(mockSuppliersService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('仕入先詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, name: 'テスト商事' } };
      mockSuppliersService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockSuppliersService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('仕入先を作成して返すこと', async () => {
      const dto = { code: 'SUP-001', name: '新仕入先' };
      const expected = { success: true, data: { id: 1, ...dto } };
      mockSuppliersService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(result).toEqual(expected);
      expect(mockSuppliersService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('仕入先を更新して返すこと', async () => {
      const dto = { name: '更新仕入先' };
      const expected = { success: true, data: { id: 1, name: '更新仕入先' } };
      mockSuppliersService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockSuppliersService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('仕入先を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Supplier deleted successfully' } };
      mockSuppliersService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1);

      expect(result).toEqual(expected);
      expect(mockSuppliersService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const suppliers = [
        {
          code: 'SUP-001',
          name: 'テスト商事',
          phone: '03-1234-5678',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockSuppliersService.findAllForExport.mockResolvedValue(suppliers);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockSuppliersService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        '仕入先一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスACTIVEが日本語「有効」に変換されること', async () => {
      const suppliers = [
        {
          code: 'SUP-001',
          name: 'テスト商事',
          phone: '03-1234-5678',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockSuppliersService.findAllForExport.mockResolvedValue(suppliers);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][3]).toBe('有効');
    });

    it('ステータスINACTIVEが日本語「無効」に変換されること', async () => {
      const suppliers = [
        {
          code: 'SUP-002',
          name: '別の商事',
          phone: null,
          status: 'INACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockSuppliersService.findAllForExport.mockResolvedValue(suppliers);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][3]).toBe('無効');
    });

    it('phoneがnullの場合は空文字列になること', async () => {
      const suppliers = [
        {
          code: 'SUP-003',
          name: '電話なし商事',
          phone: null,
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockSuppliersService.findAllForExport.mockResolvedValue(suppliers);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][2]).toBe('');
    });

    it('phoneが設定されている場合はその値が使われること', async () => {
      const suppliers = [
        {
          code: 'SUP-004',
          name: '電話あり商事',
          phone: '06-9876-5432',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockSuppliersService.findAllForExport.mockResolvedValue(suppliers);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][2]).toBe('06-9876-5432');
    });

    it('マッピングにないステータスはそのまま使用されること', async () => {
      const suppliers = [
        {
          code: 'SUP-005',
          name: '不明商事',
          phone: null,
          status: 'UNKNOWN_STATUS',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockSuppliersService.findAllForExport.mockResolvedValue(suppliers);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][3]).toBe('UNKNOWN_STATUS');
    });
  });
});
