import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { ExcelService } from './excel.service';
import { JstDateService } from '../../common/services/jst-date.service';

const mockProducts = [
  {
    id: 'product-uuid-1',
    code: 'PRD-001',
    name: 'テスト商品1',
    description: 'テスト用の商品1です',
    category: '電子機器',
    price: 10000,
    stockQuantity: 50,
    status: 'ACTIVE',
    createdById: 'user-uuid-1',
    updatedById: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    creator: { name: 'admin' },
  },
  {
    id: 'product-uuid-2',
    code: 'PRD-002',
    name: 'テスト商品2',
    description: null,
    category: '食品',
    price: 500,
    stockQuantity: 100,
    status: 'INACTIVE',
    createdById: 'user-uuid-2',
    updatedById: null,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-01'),
    creator: null,
  },
];

describe('ExcelService', () => {
  let service: ExcelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExcelService, { provide: JstDateService, useClass: JstDateService }],
    }).compile();

    service = module.get<ExcelService>(ExcelService);
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('generateProductExcel', () => {
    it('Bufferを返すこと', async () => {
      const result = await service.generateProductExcel(mockProducts as any);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('空の商品リストでもBufferを返すこと', async () => {
      const result = await service.generateProductExcel([]);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('creatorがnullの商品でもエラーにならないこと', async () => {
      const productsWithNullCreator = [
        {
          ...mockProducts[0],
          creator: null,
        },
      ];

      const result = await service.generateProductExcel(productsWithNullCreator as any);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('descriptionがnullの商品でもエラーにならないこと', async () => {
      const productsWithNullDescription = [
        {
          ...mockProducts[0],
          description: null,
        },
      ];

      const result = await service.generateProductExcel(productsWithNullDescription as any);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('DISCONTINUEDステータスの商品を正しく処理すること', async () => {
      const productsWithDiscontinued = [
        {
          ...mockProducts[0],
          status: 'DISCONTINUED',
        },
      ];

      const result = await service.generateProductExcel(productsWithDiscontinued as any);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('複数商品でも正しくBufferを生成すること', async () => {
      const result = await service.generateProductExcel(mockProducts as any);

      expect(result).toBeInstanceOf(Buffer);
      // 複数商品がある場合、バッファサイズが空より大きいことを確認
      const emptyResult = await service.generateProductExcel([]);
      expect(result.length).toBeGreaterThan(emptyResult.length);
    });

    // d644: 書き出しの日時が実行環境の時計（本番は UTC・開発機は日本時間）に従わないこと。
    it('作成日・更新日を実行環境の時計に依存しない日本時間の書式で出すこと', async () => {
      const originalTz = process.env.TZ;
      try {
        // 2026-03-16 15:05Z = 2026-03-17 00:05 JST（UTC のまま組むと 03-16 になる）。
        const products = [{ ...mockProducts[0], createdAt: new Date('2026-03-16T15:05:00.000Z') }];

        const outputs: Array<[string, string]> = [];
        for (const tz of ['UTC', 'Asia/Tokyo']) {
          process.env.TZ = tz;
          const buffer = await service.generateProductExcel(products as any);
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
          const row = workbook.getWorksheet('商品一覧')!.getRow(2);
          outputs.push([String(row.getCell(9).value), String(row.getCell(10).value)]);
        }

        expect(outputs).toEqual([
          ['2026/3/17 0:05', '2024/1/1 9:00'],
          ['2026/3/17 0:05', '2024/1/1 9:00'],
        ]);
      } finally {
        process.env.TZ = originalTz;
      }
    });
  });
});
