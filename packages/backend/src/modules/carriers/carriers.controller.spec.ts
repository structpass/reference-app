import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { CarriersController } from './carriers.controller';
import { CarriersService } from './carriers.service';
import { ExcelService } from '../../common/services/excel.service';

const mockCarriersService = {
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

describe('CarriersController', () => {
  let controller: CarriersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarriersController],
      providers: [
        { provide: CarriersService, useValue: mockCarriersService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<CarriersController>(CarriersController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('運送会社一覧を返すこと', async () => {
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };
      mockCarriersService.findAll.mockResolvedValue(expected);

      const query = { page: 1, limit: 20 };
      const result = await controller.findAll(query as any);

      expect(result).toEqual(expected);
      expect(mockCarriersService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('運送会社詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, name: 'テスト運送' } };
      mockCarriersService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockCarriersService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('運送会社を作成して返すこと', async () => {
      const dto = { code: 'CR-001', name: '新運送会社' };
      const expected = { success: true, data: { id: 1, ...dto } };
      mockCarriersService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(result).toEqual(expected);
      expect(mockCarriersService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('運送会社を更新して返すこと', async () => {
      const dto = { name: '更新運送会社' };
      const expected = { success: true, data: { id: 1, name: '更新運送会社' } };
      mockCarriersService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockCarriersService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('運送会社を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Carrier deleted' } };
      mockCarriersService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1);

      expect(result).toEqual(expected);
      expect(mockCarriersService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const carriers = [
        {
          code: 'CR-001',
          name: 'テスト運送',
          phone: '03-1234-5678',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockCarriersService.findAllForExport.mockResolvedValue(carriers);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockCarriersService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        '運送会社一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスが日本語に変換されること', async () => {
      const carriers = [
        {
          code: 'CR-001',
          name: 'テスト',
          phone: null,
          status: 'INACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockCarriersService.findAllForExport.mockResolvedValue(carriers);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][3]).toBe('無効');
      expect(rows[0][2]).toBe('');
    });
  });
});
