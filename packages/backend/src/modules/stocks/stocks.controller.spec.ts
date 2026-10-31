import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';
import { ExcelService } from '../../common/services/excel.service';

const mockStocksService = {
  findAll: jest.fn(),
  findAllForExport: jest.fn(),
  getForecast: jest.fn(),
  getForecastForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('StocksController', () => {
  let controller: StocksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StocksController],
      providers: [
        { provide: StocksService, useValue: mockStocksService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<StocksController>(StocksController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('倉庫別在庫一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockStocksService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockStocksService.findAll).toHaveBeenCalled();
    });
  });

  describe('exportExcel', () => {
    it('在庫Excelを生成してStreamableFileを返すこと', async () => {
      const stocks = [
        {
          warehouse: { code: 'WH-001', name: '倉庫A' },
          product: { code: 'PRD-001', name: '商品A', category: { name: '電子機器' }, unit: '個' },
          quantity: 100,
        },
      ];
      const buffer = Buffer.from('excel');
      mockStocksService.findAllForExport.mockResolvedValue(stocks);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockExcelService.generate).toHaveBeenCalledWith('倉庫別在庫一覧', expect.any(Array), [
        ['WH-001', '倉庫A', 'PRD-001', '商品A', '電子機器', '個', '100'],
      ]);
    });
  });

  describe('getForecast', () => {
    it('予測在庫一覧を返すこと', async () => {
      const expected = { success: true, data: [] };
      mockStocksService.getForecast.mockResolvedValue(expected);

      const result = await controller.getForecast({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockStocksService.getForecast).toHaveBeenCalled();
    });
  });

  describe('exportForecastExcel', () => {
    it('予測在庫Excelを生成してStreamableFileを返すこと', async () => {
      const forecasts = [
        {
          warehouse: { code: 'WH-001', name: '倉庫A' },
          product: { code: 'PRD-001', name: '商品A' },
          quantity: 100,
          incomingQty: 50,
          outgoingQty: 30,
          forecastQty: 120,
          alert: 'normal',
        },
      ];
      const buffer = Buffer.from('excel');
      mockStocksService.getForecastForExport.mockResolvedValue(forecasts);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportForecastExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockExcelService.generate).toHaveBeenCalledWith('予測在庫一覧', expect.any(Array), [
        ['WH-001', '倉庫A', 'PRD-001', '商品A', '100', '50', '30', '120', 'normal'],
      ]);
    });
  });
});
