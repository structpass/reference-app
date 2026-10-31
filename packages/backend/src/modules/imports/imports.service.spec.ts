import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ImportsService } from './imports.service';
import { CsvService } from '../../common/services';
import { ProductImporter, PRODUCT_TEMPLATE_HEADERS } from './importers/product.importer';
import { MAX_IMPORT_ROWS } from './imports.constants';

describe('ImportsService', () => {
  let service: ImportsService;
  let productImporter: jest.Mocked<
    Pick<ProductImporter, 'key' | 'templateHeaders' | 'validate' | 'commit' | 'dryRunCounts'>
  >;

  const headerLine = PRODUCT_TEMPLATE_HEADERS.join(',');

  const fileOf = (content: string): Express.Multer.File =>
    ({ buffer: Buffer.from(content, 'utf-8') }) as Express.Multer.File;

  // 他 15+ の service spec と同様 NestJS DI 経由でインスタンス化し統一する（直接 new を避ける）。
  // CsvService は実インスタンスを使い（実 CSV パースを検証）、ProductImporter のみ mock を注入する。
  beforeEach(async () => {
    productImporter = {
      key: 'products',
      templateHeaders: PRODUCT_TEMPLATE_HEADERS,
      validate: jest.fn(),
      commit: jest.fn(),
      dryRunCounts: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        CsvService,
        { provide: ProductImporter, useValue: productImporter },
      ],
    }).compile();
    service = module.get<ImportsService>(ImportsService);
  });

  describe('resolveTarget / getTemplate', () => {
    it('未登録の target は NotFoundException を投げること', () => {
      expect(() => service.getTemplate('warehouses')).toThrow(NotFoundException);
    });

    it('products のテンプレートはヘッダー行のみを返すこと', () => {
      const { buffer, fileName } = service.getTemplate('products');
      const text = buffer.toString('utf-8');
      expect(text).toContain(headerLine);
      expect(fileName).toBe('products-import-template.csv');
    });
  });

  describe('import — ファイルレベル検証', () => {
    it('未登録 target は NotFoundException を投げること', async () => {
      await expect(service.import('warehouses', fileOf(headerLine), false, 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ファイル未添付は ok:false になること', async () => {
      const outcome = await service.import('products', undefined, false, 'u1');
      expect(outcome.ok).toBe(false);
    });

    it('NUL バイトを含むバイナリは ok:false になること（SEC-H1: 中身検証）', async () => {
      const file = { buffer: Buffer.from([0x68, 0x69, 0x00, 0x2c, 0x61]) } as Express.Multer.File;
      const outcome = await service.import('products', file, false, 'u1');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.message).toContain('CSV');
      expect(productImporter.validate).not.toHaveBeenCalled();
    });

    it('ZIP/xlsx 署名(PK\\x03\\x04)のファイルは ok:false になること（SEC-H1: MIME 偽装防御）', async () => {
      const file = {
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
      } as Express.Multer.File;
      const outcome = await service.import('products', file, false, 'u1');
      expect(outcome.ok).toBe(false);
      expect(productImporter.validate).not.toHaveBeenCalled();
    });

    it('OLE2 compound 署名(旧 .xls/.doc)のファイルは ok:false になること（SEC-H1）', async () => {
      const file = {
        buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]),
      } as Express.Multer.File;
      const outcome = await service.import('products', file, false, 'u1');
      expect(outcome.ok).toBe(false);
      expect(productImporter.validate).not.toHaveBeenCalled();
    });

    it('GIF 署名("GIF8")のファイルは ok:false になること（SEC-H1）', async () => {
      const file = {
        buffer: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      } as Express.Multer.File;
      const outcome = await service.import('products', file, false, 'u1');
      expect(outcome.ok).toBe(false);
      expect(productImporter.validate).not.toHaveBeenCalled();
    });

    it('日本語(マルチバイト UTF-8)の正常 CSV はバイナリ誤検知しないこと（SEC-H1 偽陽性なし）', async () => {
      productImporter.validate.mockResolvedValue({ errors: [], validated: [{} as never] });
      productImporter.commit.mockResolvedValue({ created: 1, updated: 0 });
      const outcome = await service.import(
        'products',
        fileOf(`${headerLine}\nPRD-001,商品テスト名,,CAT-001,100,,,`),
        false,
        'u1',
      );
      expect(outcome.ok).toBe(true);
    });

    it('不正CSV（引用符未閉じ）は ok:false になること', async () => {
      const outcome = await service.import(
        'products',
        fileOf(`${headerLine}\n"unclosed`),
        false,
        'u1',
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.message).toContain('解析');
    });

    it('ヘッダー不一致は ok:false になること（行検証に進まない）', async () => {
      const outcome = await service.import('products', fileOf('col1,col2\na,b'), false, 'u1');
      expect(outcome.ok).toBe(false);
      expect(productImporter.validate).not.toHaveBeenCalled();
    });

    it('データ行なしは ok:false になること', async () => {
      const outcome = await service.import('products', fileOf(headerLine), false, 'u1');
      expect(outcome.ok).toBe(false);
    });

    it('行数上限超過は ok:false になること', async () => {
      const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => 'a,b,c,d,e,f,g,h').join('\n');
      const outcome = await service.import(
        'products',
        fileOf(`${headerLine}\n${rows}`),
        false,
        'u1',
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.message).toContain('上限');
      expect(productImporter.validate).not.toHaveBeenCalled();
    });
  });

  describe('import — 行検証 / commit / dryRun', () => {
    const oneDataRow = `${headerLine}\nPRD-001,商品A,,CAT-001,100,,,`;

    it('行検証エラーは ok:false で rows を載せること', async () => {
      productImporter.validate.mockResolvedValue({
        errors: [{ row: 1, column: '価格', message: '数値として解釈できません' }],
        validated: [],
      });

      const outcome = await service.import('products', fileOf(oneDataRow), false, 'u1');

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.message).toBe('CSV取込の検証に失敗しました');
        expect(outcome.rows).toHaveLength(1);
      }
      expect(productImporter.commit).not.toHaveBeenCalled();
    });

    it('dryRun=true は commit せず見込み件数を返すこと', async () => {
      productImporter.validate.mockResolvedValue({
        errors: [],
        validated: [{} as never],
      });
      productImporter.dryRunCounts.mockResolvedValue({ created: 1, updated: 0 });

      const outcome = await service.import('products', fileOf(oneDataRow), true, 'u1');

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result).toEqual({
          target: 'products',
          dryRun: true,
          created: 1,
          updated: 0,
        });
      }
      expect(productImporter.commit).not.toHaveBeenCalled();
    });

    it('dryRun=false は commit して確定件数を返すこと', async () => {
      productImporter.validate.mockResolvedValue({
        errors: [],
        validated: [{} as never],
      });
      productImporter.commit.mockResolvedValue({ created: 1, updated: 0 });

      const outcome = await service.import('products', fileOf(oneDataRow), false, 'u1');

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result).toEqual({
          target: 'products',
          dryRun: false,
          created: 1,
          updated: 0,
        });
      }
      expect(productImporter.commit).toHaveBeenCalledWith([{}], 'u1');
    });
  });
});
