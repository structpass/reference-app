import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('@/lib/api-client', () => ({
  default: { post: vi.fn() },
}));

import apiClient from '@/lib/api-client';
import { runImport, templateUrl } from '@/features/imports/lib/api';

function makeCsvFile(): File {
  return new File(['商品コード\nP-1'], 'products.csv', { type: 'text/csv' });
}

/** AxiosError を任意の response で生成するヘルパ。 */
function makeAxiosError(status: number, data: unknown): AxiosError {
  const err = new AxiosError('request failed');
  err.response = {
    status,
    data,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return err;
}

describe('imports api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('templateUrl', () => {
    it('対象別のテンプレート URL を返すこと', () => {
      expect(templateUrl('products')).toBe('/imports/products/template');
    });
  });

  describe('runImport', () => {
    it('multipart/form-data + dryRun query で POST すること', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { success: true, data: { target: 'products', dryRun: true, created: 2, updated: 3 } },
      });

      await runImport('products', makeCsvFile(), true);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/imports/products',
        expect.any(FormData),
        expect.objectContaining({
          params: { dryRun: true },
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      );
      // FormData に file フィールドが入っていること
      const sentForm = vi.mocked(apiClient.post).mock.calls[0][1] as FormData;
      expect(sentForm.get('file')).toBeInstanceOf(File);
    });

    it('成功応答を ok:true の result として返すこと', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          success: true,
          data: { target: 'products', dryRun: false, created: 5, updated: 1 },
        },
      });

      const outcome = await runImport('products', makeCsvFile(), false);

      expect(outcome).toEqual({
        ok: true,
        result: { target: 'products', dryRun: false, created: 5, updated: 1 },
      });
    });

    it('行レベル VALIDATION_ERROR を ok:false の validation として返すこと', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(
        makeAxiosError(400, {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'CSV取込の検証に失敗しました',
            details: {
              rows: [{ row: 3, column: '価格', message: '数値として解釈できません' }],
            },
          },
        }),
      );

      const outcome = await runImport('products', makeCsvFile(), false);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.validation.message).toBe('CSV取込の検証に失敗しました');
        expect(outcome.validation.rows).toHaveLength(1);
        expect(outcome.validation.rows[0]).toEqual({
          row: 3,
          column: '価格',
          message: '数値として解釈できません',
        });
      }
    });

    it('ファイルレベル VALIDATION_ERROR は rows 空配列で返すこと', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(
        makeAxiosError(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'ヘッダー行が一致しません' },
        }),
      );

      const outcome = await runImport('products', makeCsvFile(), false);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.validation.message).toBe('ヘッダー行が一致しません');
        expect(outcome.validation.rows).toEqual([]);
      }
    });

    it('VALIDATION_ERROR 以外のエラー（5xx）は re-throw すること', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(
        makeAxiosError(500, { success: false, error: { code: 'INTERNAL_ERROR' } }),
      );

      await expect(runImport('products', makeCsvFile(), false)).rejects.toBeInstanceOf(AxiosError);
    });
  });
});
