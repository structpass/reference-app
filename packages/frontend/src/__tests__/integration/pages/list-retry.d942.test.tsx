// d942: 一覧の失敗表示からの再試行を、実画面（ページ）の単位で縛る。
// 見るのは ①押した瞬間に「読み込み直している」ことが画面から分かるか ②自由定義の台帳で、
// 再試行が明細だけでなく台帳定義（列と台帳名の元）も取り直すか。
// ①は押せないことだけでは足りない（色が薄くなる程度で、取り直しているのか止まったのか
// 分からない）。②は、台帳定義だけが落ちた時に台帳名・列が戻らないままになるのを防ぐ。
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { apiPath } from '../_helpers/api-base';
import ProductsPage from '@/app/dashboard/products/page';
import CustomLedgerPage from '@/app/dashboard/custom/[key]/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

function resolvedParams<T extends object>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = 'fulfilled';
  p.value = value;
  return p;
}

/** 応答を release() まで止める。時間待ちだと遅い環境で結果が先に届き、判定が揺れる。 */
function gated<T>(body: T) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  return {
    release,
    calls: () => calls,
    handler: async () => {
      calls += 1;
      await gate;
      return HttpResponse.json(body as object);
    },
  };
}

describe('一覧の再試行 (d942)', () => {
  it('再試行を押した直後、失敗の表示が処理中（読み込み直しています）に切り替わる', async () => {
    // 1 度目は失敗、2 度目は止めたまま返さない → 押した直後の見え方を観察できる
    let first = true;
    const second = gated({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
    server.use(
      http.get(apiPath('/products'), () => {
        if (first) {
          first = false;
          return HttpResponse.json({ message: 'error' }, { status: 500 });
        }
        return second.handler();
      }),
    );

    const user = userEvent.setup();
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // 失敗しただけの状態では処理中の案内を出さない
    expect(screen.queryByText('読み込み直しています…')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '再試行' }));

    // 押した瞬間に処理中へ切り替わる（応答はまだ返っていない）
    await waitFor(() => {
      expect(screen.getByText('読み込み直しています…')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '再試行' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveAttribute('aria-busy', 'true');

    // 処理中に押しても要求は重ならない。disabled への click は jsdom で届くことがあり、
    // 遅い環境（coverage 付きの全件実行）では押下そのものが揺れるため、押さずに状態と要求回数で固定する。
    expect(second.calls()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('button', { name: '再試行' })).toBeDisabled();
    expect(second.calls()).toBe(1);

    second.release();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('自由定義の台帳の再試行は、明細と台帳定義の両方を取り直す', async () => {
    // 明細が 1 度目だけ 500。台帳定義は数えるだけ（再試行で取り直されるかを見る）。
    let recordCalls = 0;
    let definitionCalls = 0;
    server.use(
      http.get(apiPath('/object-types/:key/records'), ({ request }) => {
        recordCalls += 1;
        if (recordCalls === 1) {
          return HttpResponse.json({ message: 'error' }, { status: 500 });
        }
        const url = new URL(request.url);
        return HttpResponse.json({
          data: [
            {
              id: 1,
              objectTypeId: 10,
              data: { name: '仕入先A' },
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
          meta: {
            total: 1,
            page: Number(url.searchParams.get('page') ?? '1'),
            limit: Number(url.searchParams.get('limit') ?? '50'),
            totalPages: 1,
          },
        });
      }),
      http.get(apiPath('/object-types/:key'), () => {
        definitionCalls += 1;
        return HttpResponse.json({
          data: {
            id: 10,
            key: 'supplier-score',
            name: '仕入先評価',
            icon: null,
            sortOrder: 6,
            isPreset: false,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            fieldDefs: [
              {
                id: 1,
                objectTypeId: 10,
                key: 'name',
                label: '仕入先名',
                type: 'TEXT',
                required: true,
                sortOrder: 1,
              },
            ],
          },
        });
      }),
    );

    const user = userEvent.setup();
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const before = { records: recordCalls, definitions: definitionCalls };
    expect(before.records).toBeGreaterThan(0);
    expect(before.definitions).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '再試行' }));

    // 列見出し（台帳定義から作る）と明細の両方が戻る
    await waitFor(() => expect(screen.getByText('仕入先A')).toBeInTheDocument());
    expect(screen.getByText('仕入先名')).toBeInTheDocument();
    expect(screen.getByText('仕入先評価')).toBeInTheDocument();

    // 取り直したのは明細だけではない（台帳定義も 1 回取り直している）
    expect(recordCalls).toBe(before.records + 1);
    expect(definitionCalls).toBe(before.definitions + 1);
  });
});
