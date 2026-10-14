import { ProductImporter, PRODUCT_TEMPLATE_HEADERS } from './product.importer';
import { ProductsRepository } from '../../products/repositories/products.repository';
import { CategoriesRepository } from '../../categories/repositories/categories.repository';

describe('ProductImporter', () => {
  let importer: ProductImporter;
  let productsRepo: jest.Mocked<Pick<ProductsRepository, 'bulkUpsertByCode' | 'findExistingCodes'>>;
  let categoriesRepo: jest.Mocked<Pick<CategoriesRepository, 'findByCode'>>;

  // CAT-001 / CAT-002 のみ存在するカテゴリーとして扱う
  const knownCategories: Record<string, { id: number }> = {
    'CAT-001': { id: 1 },
    'CAT-002': { id: 2 },
  };

  beforeEach(() => {
    productsRepo = {
      bulkUpsertByCode: jest.fn(),
      findExistingCodes: jest.fn(),
    };
    categoriesRepo = {
      findByCode: jest.fn(async (code: string) => (knownCategories[code] as never) ?? null),
    };
    importer = new ProductImporter(
      productsRepo as unknown as ProductsRepository,
      categoriesRepo as unknown as CategoriesRepository,
    );
  });

  // 有効な 8 列データ行を組み立てる
  const validRow = (overrides: Partial<Record<number, string>> = {}): string[] => {
    const base = ['PRD-001', '商品A', '説明', 'CAT-001', '100', '80', '個', '有効'];
    for (const [idx, val] of Object.entries(overrides)) {
      if (val !== undefined) base[Number(idx)] = val;
    }
    return base;
  };

  it('key と templateHeaders が定義されていること', () => {
    expect(importer.key).toBe('products');
    expect(importer.templateHeaders).toEqual(PRODUCT_TEMPLATE_HEADERS);
    expect(importer.templateHeaders).toHaveLength(8);
  });

  describe('validate — 正常系', () => {
    it('有効な行を検証通過し正規化済み行を返すこと', async () => {
      const result = await importer.validate([validRow()]);

      expect(result.errors).toHaveLength(0);
      expect(result.validated).toHaveLength(1);
      expect(result.validated[0]).toEqual({
        code: 'PRD-001',
        name: '商品A',
        description: '説明',
        categoryId: 1,
        price: 100,
        purchasePrice: 80,
        unit: '個',
        status: 'ACTIVE',
      });
    });

    it('任意列の空欄を null に正規化し status 空欄は ACTIVE にすること', async () => {
      const result = await importer.validate([validRow({ 2: '', 5: '', 6: '', 7: '' })]);

      expect(result.errors).toHaveLength(0);
      expect(result.validated[0].description).toBeNull();
      expect(result.validated[0].purchasePrice).toBeNull();
      expect(result.validated[0].unit).toBeNull();
      expect(result.validated[0].status).toBe('ACTIVE');
    });

    it('status 値（有効/無効/廃止）を enum にマッピングすること', async () => {
      const result = await importer.validate([
        validRow({ 0: 'P1', 7: '有効' }),
        validRow({ 0: 'P2', 7: '無効' }),
        validRow({ 0: 'P3', 7: '廃止' }),
      ]);

      expect(result.errors).toHaveLength(0);
      expect(result.validated.map((r) => r.status)).toEqual(['ACTIVE', 'INACTIVE', 'DISCONTINUED']);
    });
  });

  describe('validate — 行レベル検証', () => {
    it('列数がヘッダーと不一致の行を行レベルエラーにすること', async () => {
      const result = await importer.validate([['PRD-001', '商品A']]);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(1);
      expect(result.validated).toHaveLength(0);
    });

    it('必須列（商品コード）が空ならエラーにすること', async () => {
      const result = await importer.validate([validRow({ 0: '' })]);

      expect(result.errors.some((e) => e.column === '商品コード')).toBe(true);
    });

    it('必須列（商品名 / カテゴリーコード / 価格）の空欄をエラーにすること', async () => {
      const result = await importer.validate([validRow({ 1: '', 3: '', 4: '' })]);

      const cols = result.errors.map((e) => e.column);
      expect(cols).toContain('商品名');
      expect(cols).toContain('カテゴリーコード');
      expect(cols).toContain('価格');
    });

    it('価格が数値として解釈できない場合エラーにすること', async () => {
      const result = await importer.validate([validRow({ 4: 'abc' })]);

      expect(result.errors.some((e) => e.column === '価格')).toBe(true);
    });

    it('価格が負値の場合エラーにすること', async () => {
      const result = await importer.validate([validRow({ 4: '-1' })]);

      expect(result.errors.some((e) => e.column === '価格')).toBe(true);
    });

    it('価格の小数桁が 3 桁以上の場合エラーにすること', async () => {
      const result = await importer.validate([validRow({ 4: '10.123' })]);

      expect(result.errors.some((e) => e.column === '価格')).toBe(true);
    });

    it('商品コードが 50 文字超の場合エラーにすること', async () => {
      const result = await importer.validate([validRow({ 0: 'X'.repeat(51) })]);

      expect(result.errors.some((e) => e.column === '商品コード')).toBe(true);
    });

    it('商品名が 200 文字超の場合エラーにすること', async () => {
      const result = await importer.validate([validRow({ 1: 'あ'.repeat(201) })]);

      expect(result.errors.some((e) => e.column === '商品名')).toBe(true);
    });

    it('不正な status 値をエラーにすること', async () => {
      const result = await importer.validate([validRow({ 7: '存在しない' })]);

      expect(result.errors.some((e) => e.column === 'ステータス')).toBe(true);
    });

    it('存在しないカテゴリーコードをエラーにすること', async () => {
      const result = await importer.validate([validRow({ 3: 'CAT-999' })]);

      expect(
        result.errors.some((e) => e.column === 'カテゴリーコード' && e.message.includes('CAT-999')),
      ).toBe(true);
    });

    it('ファイル内での商品コード重複を検出すること', async () => {
      const result = await importer.validate([validRow({ 0: 'DUP' }), validRow({ 0: 'DUP' })]);

      expect(
        result.errors.some((e) => e.column === '商品コード' && e.message.includes('重複')),
      ).toBe(true);
      // 重複は 2 行目で報告される
      expect(result.errors.some((e) => e.row === 2)).toBe(true);
    });

    it('長さ超過で無効なコード行は後続の同一コード行を重複扱いしないこと（CODE-M1）', async () => {
      const longCode = 'X'.repeat(51); // MAX_LEN.code(50) 超過で無効
      const result = await importer.validate([
        validRow({ 0: longCode }),
        validRow({ 0: longCode }),
      ]);

      // 1 行目は長さ超過エラーのみ。2 行目を「重複」と誤判定しないこと。
      expect(result.errors.some((e) => e.message.includes('重複'))).toBe(false);
      // 長さ超過エラーは両行とも検出される（無効行は seenCodes に積まれないため）
      expect(
        result.errors.filter((e) => e.column === '商品コード' && e.message.includes('以内')),
      ).toHaveLength(2);
    });

    it('複数行のエラーを行番号付きで全件収集すること', async () => {
      const result = await importer.validate([
        validRow({ 0: 'P1', 4: 'abc' }),
        validRow({ 0: 'P2', 3: 'CAT-999' }),
      ]);

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.find((e) => e.row === 1)).toBeTruthy();
      expect(result.errors.find((e) => e.row === 2)).toBeTruthy();
      expect(result.validated).toHaveLength(0);
    });

    it('エラーが 1 件でもあれば validated を空で返すこと', async () => {
      const result = await importer.validate([
        validRow({ 0: 'P1' }),
        validRow({ 0: 'P2', 4: 'abc' }),
      ]);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.validated).toHaveLength(0);
    });
  });

  describe('commit', () => {
    it('ProductsRepository.bulkUpsertByCode に委譲すること', async () => {
      productsRepo.bulkUpsertByCode.mockResolvedValue({ created: 2, updated: 1 });
      const rows = [
        {
          code: 'PRD-001',
          name: 'A',
          description: null,
          categoryId: 1,
          price: 100,
          purchasePrice: null,
          unit: null,
          status: 'ACTIVE' as const,
        },
      ];

      const result = await importer.commit(rows, 'user-1');

      expect(productsRepo.bulkUpsertByCode).toHaveBeenCalledWith(rows, 'user-1');
      expect(result).toEqual({ created: 2, updated: 1 });
    });
  });

  describe('dryRunCounts', () => {
    it('既存 code 有無から created / updated の見込みを算出すること', async () => {
      productsRepo.findExistingCodes.mockResolvedValue(new Set(['PRD-001']));
      const rows = [{ code: 'PRD-001' }, { code: 'PRD-002' }, { code: 'PRD-003' }].map((r) => ({
        ...r,
        name: 'x',
        description: null,
        categoryId: 1,
        price: 1,
        purchasePrice: null,
        unit: null,
        status: 'ACTIVE' as const,
      }));

      const result = await importer.dryRunCounts(rows);

      expect(result).toEqual({ created: 2, updated: 1 });
    });
  });
});
