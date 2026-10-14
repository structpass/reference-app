import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { ExcelService } from '../../common/services/excel.service';

const mockShipmentsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  confirm: jest.fn(),
  ship: jest.fn(),
  remove: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('ShipmentsController', () => {
  let controller: ShipmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShipmentsController],
      providers: [
        { provide: ShipmentsService, useValue: mockShipmentsService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<ShipmentsController>(ShipmentsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('出荷一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockShipmentsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockShipmentsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('出荷詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, shipmentNo: 'SHP-20260317-0001' } };
      mockShipmentsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockShipmentsService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('出荷を作成して返すこと', async () => {
      const dto = { warehouseId: 1, items: [] };
      const expected = { success: true, data: { id: 1 } };
      mockShipmentsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockShipmentsService.create).toHaveBeenCalledWith(dto, 'user-uuid');
    });
  });

  describe('update', () => {
    it('出荷を更新して返すこと', async () => {
      const dto = { items: [] };
      const expected = { success: true, data: { id: 1 } };
      mockShipmentsService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockShipmentsService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('confirm', () => {
    it('出荷を確定して返すこと（在庫減算）', async () => {
      const expected = { success: true, data: { id: 1, status: 'CONFIRMED' } };
      mockShipmentsService.confirm.mockResolvedValue(expected);

      const result = await controller.confirm(1, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockShipmentsService.confirm).toHaveBeenCalledWith(1, 'user-uuid');
    });
  });

  describe('ship', () => {
    it('出荷完了にして返すこと', async () => {
      const expected = { success: true, data: { id: 1, status: 'SHIPPED' } };
      mockShipmentsService.ship.mockResolvedValue(expected);

      const result = await controller.ship(1);

      expect(result).toEqual(expected);
      expect(mockShipmentsService.ship).toHaveBeenCalledWith(1);
    });
  });

  describe('remove', () => {
    it('出荷を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Shipment deleted' } };
      mockShipmentsService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockShipmentsService.remove).toHaveBeenCalledWith(1, 'user-uuid');
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const shipments = [
        {
          shipmentNo: 'SHP-20260317-0001',
          shipmentDate: new Date('2026-03-17'),
          warehouseId: 1,
          destination: '出荷先Y',
          status: 'DRAFT',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockShipmentsService.findAllForExport.mockResolvedValue(shipments);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockShipmentsService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        '出荷一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスが日本語に変換されること', async () => {
      const shipments = [
        {
          shipmentNo: 'SHP-001',
          shipmentDate: new Date('2026-03-17'),
          warehouseId: 1,
          destination: '出荷先',
          status: 'SHIPPED',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockShipmentsService.findAllForExport.mockResolvedValue(shipments);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][4]).toBe('出荷完了');
    });
  });
});
