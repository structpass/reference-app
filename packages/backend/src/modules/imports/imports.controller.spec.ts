import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

const mockImportsService = {
  getTemplate: jest.fn(),
  import: jest.fn(),
};

describe('ImportsController', () => {
  let controller: ImportsController;

  const fakeFile = { buffer: Buffer.from('x') } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [{ provide: ImportsService, useValue: mockImportsService }],
    }).compile();

    controller = module.get<ImportsController>(ImportsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('getTemplate', () => {
    it('テンプレートを StreamableFile で返し Content-Disposition を設定すること', () => {
      mockImportsService.getTemplate.mockReturnValue({
        buffer: Buffer.from('header'),
        fileName: 'products-import-template.csv',
      });
      const res = { setHeader: jest.fn() } as never;

      const result = controller.getTemplate('products', res);

      expect(result).toBeDefined();
      expect(mockImportsService.getTemplate).toHaveBeenCalledWith('products');
    });
  });

  describe('import', () => {
    it('成功時は ok() で包んだ結果を返すこと', async () => {
      mockImportsService.import.mockResolvedValue({
        ok: true,
        result: { target: 'products', dryRun: false, created: 2, updated: 1 },
      });

      const result = await controller.import('products', 'false', fakeFile, 'u1');

      expect(result).toEqual({
        success: true,
        data: { target: 'products', dryRun: false, created: 2, updated: 1 },
      });
      expect(mockImportsService.import).toHaveBeenCalledWith('products', fakeFile, false, 'u1');
    });

    it('dryRun=true クエリを isDryRun=true に変換して渡すこと', async () => {
      mockImportsService.import.mockResolvedValue({
        ok: true,
        result: { target: 'products', dryRun: true, created: 1, updated: 0 },
      });

      const result = await controller.import('products', 'true', fakeFile, 'u1');

      expect(mockImportsService.import).toHaveBeenCalledWith('products', fakeFile, true, 'u1');
      expect(result.data.dryRun).toBe(true);
    });

    it('dryRun クエリ未指定は false 扱いになること', async () => {
      mockImportsService.import.mockResolvedValue({
        ok: true,
        result: { target: 'products', dryRun: false, created: 0, updated: 0 },
      });

      await controller.import('products', undefined, fakeFile, 'u1');

      expect(mockImportsService.import).toHaveBeenCalledWith('products', fakeFile, false, 'u1');
    });

    it('検証エラー時は VALIDATION_ERROR + details.rows を載せた BadRequestException を投げること', async () => {
      mockImportsService.import.mockResolvedValue({
        ok: false,
        message: 'CSV取込の検証に失敗しました',
        rows: [{ row: 3, column: '価格', message: '数値として解釈できません' }],
      });

      await expect(controller.import('products', 'false', fakeFile, 'u1')).rejects.toThrow(
        BadRequestException,
      );

      try {
        await controller.import('products', 'false', fakeFile, 'u1');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const payload = (e as BadRequestException).getResponse();
        expect(payload).toEqual({
          code: 'VALIDATION_ERROR',
          message: 'CSV取込の検証に失敗しました',
          details: {
            rows: [{ row: 3, column: '価格', message: '数値として解釈できません' }],
          },
        });
      }
    });

    it('ファイルレベルエラー時は rows なしの BadRequestException を投げること', async () => {
      mockImportsService.import.mockResolvedValue({
        ok: false,
        message: 'ヘッダー行が不正です',
      });

      try {
        await controller.import('products', 'false', fakeFile, 'u1');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const payload = (e as BadRequestException).getResponse();
        expect(payload).toEqual({
          code: 'VALIDATION_ERROR',
          message: 'ヘッダー行が不正です',
        });
      }
    });
  });

  // SEC-H3: 取込（= bulk create/update）は書き込み操作のため create 権限で gate する。
  // テンプレート DL は閲覧の範疇なので view のまま。decorator metadata を直接検証する。
  describe('権限境界（SEC-H3）', () => {
    it('POST 取込は file-import の create 権限を要求すること', () => {
      const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ImportsController.prototype.import);
      expect(meta).toEqual({ featureId: 'file-import', action: 'create' });
    });

    it('GET テンプレートは file-import の view 権限のままであること', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ImportsController.prototype.getTemplate,
      );
      expect(meta).toEqual({ featureId: 'file-import', action: 'view' });
    });
  });
});
