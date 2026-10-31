import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const downloadText = vi.fn();
vi.mock('@/hooks/use-file-download', () => ({
  useFileDownload: () => ({ download: vi.fn(), downloadText }),
}));

import { ImportResultPanel } from '@/features/imports/components/import-result-panel';

describe('ImportResultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功（本実行）時は新規/更新件数を表示すること', () => {
    render(
      <ImportResultPanel
        feedback={{
          kind: 'success',
          result: { target: 'products', dryRun: false, created: 12, updated: 30 },
        }}
      />,
    );
    expect(screen.getByText('取込が完了しました')).toBeInTheDocument();
    expect(screen.getByText('新規 12 件 / 更新 30 件')).toBeInTheDocument();
  });

  it('成功（ドライラン）時は見込みと明示すること', () => {
    render(
      <ImportResultPanel
        feedback={{
          kind: 'success',
          result: { target: 'products', dryRun: true, created: 5, updated: 7 },
        }}
      />,
    );
    expect(screen.getByText('検証が完了しました（取込は実行されていません）')).toBeInTheDocument();
    expect(screen.getByText('見込み: 新規 5 件 / 更新 7 件')).toBeInTheDocument();
  });

  it('行レベル検証エラー時は行番号・列・理由のテーブルを表示すること', () => {
    render(
      <ImportResultPanel
        feedback={{
          kind: 'validation',
          error: {
            message: 'CSV取込の検証に失敗しました',
            rows: [
              { row: 3, column: '価格', message: '数値として解釈できません' },
              { row: 7, column: 'カテゴリーコード', message: '存在しません' },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('検証に失敗しました（0 件取込）')).toBeInTheDocument();
    expect(screen.getByText('数値として解釈できません')).toBeInTheDocument();
    expect(screen.getByText('カテゴリーコード')).toBeInTheDocument();
    expect(screen.getByText('エラー 2 件')).toBeInTheDocument();
  });

  it('エラー CSV ダウンロードボタンで downloadText を呼ぶこと', async () => {
    const user = userEvent.setup();
    render(
      <ImportResultPanel
        feedback={{
          kind: 'validation',
          error: {
            message: '検証失敗',
            rows: [{ row: 1, column: '価格', message: 'NG' }],
          },
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /エラー CSV ダウンロード/ }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [content, filename] = downloadText.mock.calls[0];
    expect(filename).toBe('import-errors.csv');
    expect(content).toContain('行番号,列,理由');
    expect(content).toContain('1,価格,NG');
  });

  it('ファイルレベルエラー時は message のみ表示しテーブルを出さないこと', () => {
    render(
      <ImportResultPanel
        feedback={{
          kind: 'validation',
          error: { message: 'ヘッダー行が一致しません', rows: [] },
        }}
      />,
    );
    expect(screen.getByText('ヘッダー行が一致しません')).toBeInTheDocument();
    expect(screen.queryByText('行番号')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /エラー CSV ダウンロード/ }),
    ).not.toBeInTheDocument();
  });
});
