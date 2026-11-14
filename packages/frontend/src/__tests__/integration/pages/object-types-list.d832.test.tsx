// d832: 台帳管理の一覧を、他の一覧画面と同じ土台（一覧フック＋共通の表）へ載せたことを見る試験。
// 見るのは ①取得した並び（sortOrder・名前順）で行が出て中身も正しい ②絞り込みで 0 件の案内が
// 「条件に合わない」側に切り替わる ③取得失敗は「0 件」と見分けて失敗の表示を出し、再試行で
// 取り直す ④遅れて届いた古い応答で、今の条件の表示を上書きしない。
import { renderHook, act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { render } from '../_helpers/render-page';
import { apiPath } from '../_helpers/api-base';
import { server } from '../../mocks/server';
import { useListPage } from '@/hooks/use-list-page';
import ObjectTypesPage from '@/app/dashboard/object-types/page';

const originalError = console.error;
beforeAll(() => {
  // 失敗を見せる試験なので、失敗由来の既定の雑音は落とす。
  console.error = () => {};
});
afterAll(() => {
  console.error = originalError;
});

/** 一覧の明細行（見出し行を除く）を、表示されている順で返す */
async function listRows() {
  const table = await screen.findByRole('table', { name: '台帳一覧' });
  return within(table).getAllByRole('row').slice(1);
}

describe('台帳管理の一覧 (d832)', () => {
  it('台帳を並び順で行に出し、項目数と種別を出す', async () => {
    render(<ObjectTypesPage />);

    const rows = await listRows();
    // 並びは sortOrder（モックの並びは送信順と違うため、画面の並べ替えが見える）
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringContaining('商品'),
      expect.stringContaining('仕入先評価'),
      expect.stringContaining('取引先監査'),
    ]);
    // 一覧 API が添える項目数（fieldCount）が出る。台帳ごとの詳細は取りに行かない（d899）
    expect(within(rows[0]).getByText('0')).toBeInTheDocument();
    expect(within(rows[0]).getByText('プリセット')).toBeInTheDocument();
    // プリセットの操作列は一覧画面と同じ行高に収めるため記号だけを出し、理由は title と読み上げ用の文に持たせる（d1172）。
    const presetAction = within(rows[0]).getByTitle('プリセット台帳は構造を変更できません');
    expect(presetAction).toHaveTextContent('—');
    expect(within(rows[0]).getByText('プリセット台帳は構造を変更できません')).toBeInTheDocument();
    expect(within(rows[1]).getByText('supplier-score')).toBeInTheDocument();
    expect(within(rows[1]).getByText('3')).toBeInTheDocument();
    expect(within(rows[1]).getByText('ユーザー定義')).toBeInTheDocument();
    expect(within(rows[2]).getByText('vendor-audit')).toBeInTheDocument();
    expect(within(rows[2]).getByText('1')).toBeInTheDocument();
  });

  it('絞り込みで 0 件になったら、条件に合わない旨の案内を出す', async () => {
    const user = userEvent.setup();
    render(<ObjectTypesPage />);

    await listRows();

    await user.type(screen.getByPlaceholderText('台帳名・キーで検索...'), '存在しない台帳');

    // 絞り込みは入力から少し置いてから効く（FilterBar の待ち）。0 件の案内が切り替わる
    await waitFor(
      () => {
        expect(screen.getByText('条件に合う台帳がありませんでした')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('取得失敗を 0 件と取り違えず、失敗の表示を出す', async () => {
    server.use(
      http.get(apiPath('/object-types'), () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'unavailable' } },
          { status: 500 },
        ),
      ),
    );

    render(<ObjectTypesPage />);

    const box = await screen.findByRole('alert');
    expect(within(box).getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByText('台帳が見つかりませんでした')).not.toBeInTheDocument();
    expect(screen.queryByText('台帳一覧')).not.toBeInTheDocument();
  });

  it('台帳ごとの詳細を取りに行かず、一覧 1 本で項目数を出す（d899）', async () => {
    const detailKeys: string[] = [];
    server.use(
      http.get(apiPath('/object-types/:key'), ({ params }) => {
        detailKeys.push(String(params.key));
        return HttpResponse.json(
          { success: false, error: { message: 'ObjectType not found' } },
          { status: 404 },
        );
      }),
    );

    render(<ObjectTypesPage />);

    const rows = await listRows();
    // 詳細が 404 でも一覧は出て、項目数も一覧の fieldCount から出る
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('3')).toBeInTheDocument();
    expect(detailKeys).toEqual([]);
  });

  it('失敗の表示から再試行すると一覧を取り直す', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(apiPath('/object-types'), () => {
        calls += 1;
        return HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'unavailable' } },
          { status: 500 },
        );
      }),
    );

    render(<ObjectTypesPage />);

    const box = await screen.findByRole('alert');
    await waitFor(() => {
      expect(calls).toBe(1);
    });

    await user.click(within(box).getByRole('button', { name: '再試行' }));

    // 同じ引数で取り直すので、押した時点で必ず要求が 1 回増える
    await waitFor(() => {
      expect(calls).toBe(2);
    });
  });
});

describe('一覧フックの取得手順の差し替え (d832)', () => {
  it('遅れて届いた古い応答で、今の条件の表示を上書きしない', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetchFirst = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstGate;
        return { data: [{ id: 1, name: '古い' }], meta: null };
      })
      .mockImplementation(async () => ({ data: [{ id: 2, name: '新しい' }], meta: null }));

    const { result } = renderHook(() =>
      useListPage<{ id: number; name: string }>({
        tableId: 'object-types',
        basePath: '/object-types',
        entityName: '台帳',
        fetch: fetchFirst,
      }),
    );

    // 1 回目の取得を止めたまま、絞り込みを変えて 2 回目の取得を先に終わらせる
    await act(async () => {
      result.current.handleFilterChange({ search: '新しい' });
    });
    await waitFor(() => {
      expect(result.current.items.map((item) => item.name)).toEqual(['新しい']);
    });

    // 止めていた古い取得を遅れて解放する。古い行に戻らないこと
    await act(async () => {
      releaseFirst();
      await firstGate;
    });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.items.map((item) => item.name)).toEqual(['新しい']);
    expect(fetchFirst).toHaveBeenCalledTimes(2);
  });
});
