import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { ReceivingsController } from './receivings.controller';
import { ReceivingsService } from './receivings.service';
import { ExcelService } from '../../common/services/excel.service';

const mockReceivingsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  confirm: jest.fn(),
  complete: jest.fn(),
  remove: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('ReceivingsController', () => {
  let controller: ReceivingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceivingsController],
      providers: [
        { provide: ReceivingsService, useValue: mockReceivingsService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<ReceivingsController>(ReceivingsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('入荷一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockReceivingsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockReceivingsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('入荷詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, receivingNo: 'RCV-20260317-0001' } };
      mockReceivingsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockReceivingsService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('入荷を作成して返すこと', async () => {
      const dto = { warehouseId: 1, items: [] };
      const expected = { success: true, data: { id: 1 } };
      mockReceivingsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockReceivingsService.create).toHaveBeenCalledWith(dto, 'user-uuid');
    });
  });

  describe('update', () => {
    it('入荷を更新して返すこと', async () => {
      const dto = { items: [] };
      const expected = { success: true, data: { id: 1 } };
      mockReceivingsService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockReceivingsService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('confirm', () => {
    it('入荷を確定して返すこと（在庫加算）', async () => {
      const expected = { success: true, data: { id: 1, status: 'CONFIRMED' } };
      mockReceivingsService.confirm.mockResolvedValue(expected);

      const result = await controller.confirm(1, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockReceivingsService.confirm).toHaveBeenCalledWith(1, 'user-uuid');
    });
  });

  describe('complete', () => {
    it('入荷を完了にして返すこと', async () => {
      const expected = { success: true, data: { id: 1, status: 'COMPLETED' } };
      mockReceivingsService.complete.mockResolvedValue(expected);

      const result = await controller.complete(1);

      expect(result).toEqual(expected);
      expect(mockReceivingsService.complete).toHaveBeenCalledWith(1);
    });
  });

  describe('remove', () => {
    it('入荷を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Receiving deleted' } };
      mockReceivingsService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockReceivingsService.remove).toHaveBeenCalledWith(1, 'user-uuid');
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const receivings = [
        {
          receivingNo: 'RCV-20260317-0001',
          receivingDate: new Date('2026-03-17'),
          warehouseId: 1,
          supplierId: 1,
          status: 'DRAFT',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockReceivingsService.findAllForExport.mockResolvedValue(receivings);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockReceivingsService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        '入荷一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスが日本語に変換されること', async () => {
      const receivings = [
        {
          receivingNo: 'RCV-001',
          receivingDate: new Date('2026-03-17'),
          warehouseId: 1,
          supplierId: 1,
          status: 'CONFIRMED',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockReceivingsService.findAllForExport.mockResolvedValue(receivings);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][4]).toBe('確定');
    });
  });
});
