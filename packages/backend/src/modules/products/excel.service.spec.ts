import { Test, TestingModule } from '@nestjs/testing';
import { ExcelService } from './excel.service';

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
      providers: [ExcelService],
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
  });
});
