import { ExcelService } from './excel.service';

describe('ExcelService', () => {
  let service: ExcelService;

  beforeEach(() => {
    service = new ExcelService();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    it('Excelバッファを生成すること', async () => {
      const columns = [
        { header: '名前', width: 20 },
        { header: '年齢', width: 10 },
      ];
      const rows = [
        ['太郎', '30'],
        ['花子', '25'],
      ];

      const buffer = await service.generate('テストシート', columns, rows);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('空のデータでもバッファを生成すること', async () => {
      const columns = [{ header: 'A' }, { header: 'B' }];
      const rows: string[][] = [];

      const buffer = await service.generate('空シート', columns, rows);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('width未指定時にヘッダー文字列長からデフォルト幅を算出すること', async () => {
      const columns = [{ header: '短い' }];
      const rows = [['データ']];

      const buffer = await service.generate('テスト', columns, rows);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('複数行のデータを正しく処理すること', async () => {
      const columns = [
        { header: 'コード', width: 15 },
        { header: '名称', width: 25 },
        { header: '金額', width: 12 },
      ];
      const rows = [
        ['PRD-001', '商品A', '1000'],
        ['PRD-002', '商品B', '2000'],
        ['PRD-003', '商品C', '3000'],
      ];

      const buffer = await service.generate('商品一覧', columns, rows);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
