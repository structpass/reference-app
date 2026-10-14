import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ExcelService } from '../../common/services/excel.service';

const mockOrdersService = {
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

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('発注一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockOrdersService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockOrdersService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('発注詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, orderNo: 'PO-20260317-001' } };
      mockOrdersService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockOrdersService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('発注を作成して返すこと', async () => {
      const dto = { supplierId: 1, items: [] };
      const expected = { success: true, data: { id: 1, orderNo: 'PO-20260317-001' } };
      mockOrdersService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockOrdersService.create).toHaveBeenCalledWith(dto, 'user-uuid');
    });
  });

  describe('update', () => {
    it('発注を更新して返すこと', async () => {
      const dto = { items: [] };
      const expected = { success: true, data: { id: 1 } };
      mockOrdersService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any);

      expect(result).toEqual(expected);
      expect(mockOrdersService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('confirm', () => {
    it('発注を確定して返すこと', async () => {
      const expected = { success: true, data: { id: 1, status: 'ORDERED' } };
      mockOrdersService.confirm.mockResolvedValue(expected);

      const result = await controller.confirm(1);

      expect(result).toEqual(expected);
      expect(mockOrdersService.confirm).toHaveBeenCalledWith(1);
    });
  });

  describe('remove', () => {
    it('発注を削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'Order deleted' } };
      mockOrdersService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1);

      expect(result).toEqual(expected);
      expect(mockOrdersService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const orders = [
        {
          orderNo: 'PO-20260317-001',
          orderDate: new Date('2026-03-17'),
          supplierId: 1,
          totalAmount: 50000,
          status: 'DRAFT',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockOrdersService.findAllForExport.mockResolvedValue(orders);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockOrdersService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        '発注一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ステータスが日本語に変換されること', async () => {
      const orders = [
        {
          orderNo: 'PO-001',
          orderDate: new Date('2026-03-17'),
          supplierId: 1,
          totalAmount: 1000,
          status: 'ORDERED',
          createdAt: new Date('2026-03-17'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockOrdersService.findAllForExport.mockResolvedValue(orders);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][4]).toBe('発注確定');
    });
  });
});
