import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { ExcelService } from '../../common/services/excel.service';
import { JstDateService } from '../../common/services/jst-date.service';

const mockShippingService = {
  findAll: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('ShippingController', () => {
  let controller: ShippingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShippingController],
      providers: [
        { provide: ShippingService, useValue: mockShippingService },
        { provide: ExcelService, useValue: mockExcelService },
        JstDateService,
      ],
    }).compile();

    controller = module.get<ShippingController>(ShippingController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('入出荷統合一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockShippingService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockShippingService.findAll).toHaveBeenCalled();
    });
  });

  describe('exportExcel', () => {
    it('Excelファイルを生成してStreamableFileを返すこと', async () => {
      const records = [
        {
          type: 'RECEIVING',
          documentNo: 'RCV-20260317-0001',
          date: new Date('2026-03-17'),
          warehouseName: '倉庫A',
          counterparty: '仕入先X',
          status: 'CONFIRMED',
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockShippingService.findAllForExport.mockResolvedValue(records);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockShippingService.findAllForExport).toHaveBeenCalled();
      expect(mockExcelService.generate).toHaveBeenCalledWith('入出荷一覧', expect.any(Array), [
        ['入荷', 'RCV-20260317-0001', '2026-03-17', '倉庫A', '仕入先X', 'CONFIRMED'],
      ]);
    });

    // v2-534: 日本時間の 0:00〜9:00 の記録が前日にならない（保存は UTC、出力は日本時間）。
    it('日本時間の早朝に作られた記録の日付を前日にせず、日本時間の日付で出すこと', async () => {
      const records = [
        {
          type: 'RECEIVING',
          documentNo: 'RCV-20260317-0001',
          // 2026-03-16 15:05Z = 2026-03-17 00:05 JST（UTC の暦日だと 03-16 になる）
          date: new Date('2026-03-16T15:05:00.000Z'),
          warehouseName: '倉庫A',
          counterparty: '仕入先X',
          status: 'CONFIRMED',
        },
      ];
      mockShippingService.findAllForExport.mockResolvedValue(records);
      mockExcelService.generate.mockResolvedValue(Buffer.from('excel-data'));

      await controller.exportExcel({} as any);

      expect(mockExcelService.generate).toHaveBeenCalledWith('入出荷一覧', expect.any(Array), [
        ['入荷', 'RCV-20260317-0001', '2026-03-17', '倉庫A', '仕入先X', 'CONFIRMED'],
      ]);
    });
  });
});
