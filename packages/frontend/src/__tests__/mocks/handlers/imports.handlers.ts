import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

/**
 * ファイル取込（CSV import）の MSW handler 群。
 *
 * 取込エンドポイントは `POST /imports/:target`（dryRun クエリで検証のみ/実行を切替）。
 * 成功は `{ success: true, data: ImportResult }`、行レベル検証エラーは
 * HTTP 400 + `{ success: false, error: { code: 'VALIDATION_ERROR', details: { rows } } }`
 * を返す（`features/imports/lib/api.ts` の runImport が判別する shape）。
 */

interface ImportResultFixture {
  target: string;
  dryRun: boolean;
  created: number;
  updated: number;
}

interface RowErrorFixture {
  row: number;
  column: string;
  message: string;
}

const defaultResult = (dryRun: boolean): ImportResultFixture => ({
  target: 'products',
  dryRun,
  created: 2,
  updated: 1,
});

/** 取込成功 handler。dryRun クエリをそのまま結果に反映する。 */
export const importsSuccessHandler = (result?: Partial<ImportResultFixture>) =>
  http.post(apiPath('/imports/products'), ({ request }) => {
    const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';
    return HttpResponse.json({
      success: true,
      data: { ...defaultResult(dryRun), ...result },
    });
  });

/** 行レベル検証エラー handler（HTTP 400 VALIDATION_ERROR）。 */
export const importsValidationErrorHandler = (rows: RowErrorFixture[]) =>
  http.post(apiPath('/imports/products'), () =>
    HttpResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'CSV の内容に誤りがあります',
          details: { rows },
        },
      },
      { status: 400 },
    ),
  );

/** テンプレート CSV 取得 handler（blob 応答）。 */
export const importsTemplateHandler = http.get(apiPath('/imports/products/template'), () =>
  HttpResponse.text('code,name,price\n', {
    headers: { 'Content-Type': 'text/csv' },
  }),
);
