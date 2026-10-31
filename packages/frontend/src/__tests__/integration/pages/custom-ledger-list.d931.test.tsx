// d931: 自由定義の台帳の一覧を、他の一覧画面と同じ土台（一覧フック＋共通の表）へ寄せたことを
// 見る試験。共通フック側にだけ入っていた直しがこの画面にも効くことを、台帳の一覧の実画面で縛る。
// 見るのは ①取得失敗を 0 件と取り違えない（再試行で取り直す）②一覧を 1 本だけ取り、台帳定義は
// 同じ取得で届く ③遅れて届いた古い応答で、今の表示を上書きしない ④台帳が無ければ
// 「見つかりませんでした」を出す ⑤失敗の表示から再試行すると再取得する。
import { render, screen, waitFor } from '../_helpers/render-page';
import { apiPath } from '../_helpers/api-base';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
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

const LEDGER = {
  id: 10,
  key: 'supplier-score',
  name: '仕入先評価',
  icon: 'clipboard-check',
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
};

function recordsResponse(names: string[], page = 1, limit = 200) {
  return HttpResponse.json({
    data: names.map((name, i) => ({
      id: i + 1,
      objectTypeId: 10,
      data: { name },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })),
    meta: { total: names.length, page, limit, totalPages: 1 },
  });
}

describe('自由定義の台帳の一覧 (d931)', () => {
  it('一覧を 1 本だけ取り、台帳定義と同じ取得で列と台帳名を出す', async () => {
    const calls: string[] = [];
    server.use(
      http.get(apiPath('/object-types/:key/records'), ({ request }) => {
        calls.push(request.url);
        return recordsResponse(['仕入先A', '仕入先B']);
      }),
    );

    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => expect(screen.getByText('仕入先A')).toBeInTheDocument());
    expect(screen.getByText('仕入先評価')).toBeInTheDocument();
    expect(screen.getByText('仕入先名')).toBeInTheDocument();
    expect(screen.getByText('全 2 件')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('取得失敗を 0 件と取り違えず、失敗の表示を出して再試行で取り直す', async () => {
    let calls = 0;
    server.use(
      http.get(apiPath('/object-types/:key/records'), () => {
        calls += 1;
        return HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'unavailable' } },
          { status: 500 },
        );
      }),
    );

    const user = userEvent.setup();
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument());
    expect(screen.queryByText('データが見つかりませんでした')).not.toBeInTheDocument();
    expect(screen.queryByText('指定された台帳は見つかりませんでした。')).not.toBeInTheDocument();

    // 失敗したまま押す。同じ引数でも取り直す（押した時点で要求が必ず 1 回増える）
    server.resetHandlers();
    server.use(
      http.get(apiPath('/object-types/:key/records'), () => {
        calls += 1;
        return recordsResponse(['仕入先A']);
      }),
    );
    await user.click(screen.getByRole('button', { name: '再試行' }));

    await waitFor(() => expect(screen.getByText('仕入先A')).toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it('遅れて届いた古い応答で、今の表示を上書きしない', async () => {
    // 1 回目の取得（初回）を止めたまま、台帳を切り替えて 2 回目の取得を先に終わらせる
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    server.use(
      http.get(apiPath('/object-types/:key/records'), async ({ params }) => {
        calls += 1;
        const key = String(params.key);
        if (key === 'supplier-score') {
          await firstGate;
          return recordsResponse(['古い台帳の行']);
        }
        return recordsResponse(['新しい台帳の行']);
      }),
      http.get(apiPath('/object-types/:key'), ({ params }) => {
        const key = String(params.key);
        if (key === 'supplier-score') return HttpResponse.json({ data: LEDGER });
        return HttpResponse.json({
          data: { ...LEDGER, key, id: 11, name: '取引先監査' },
        });
      }),
    );

    const { rerender } = render(
      <CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />,
    );
    await waitFor(() => expect(calls).toBe(1));

    rerender(<CustomLedgerPage params={resolvedParams({ key: 'vendor-audit' })} />);
    await waitFor(() => expect(screen.getByText('新しい台帳の行')).toBeInTheDocument());
    expect(screen.getByText('取引先監査')).toBeInTheDocument();

    releaseFirst();
    await waitFor(() => expect(screen.getByText('新しい台帳の行')).toBeInTheDocument());
    expect(screen.queryByText('古い台帳の行')).not.toBeInTheDocument();
  });

  it('台帳定義だけが取れない時は、データ 0 件ではなく「見つかりませんでした」を出す', async () => {
    // 門（ObjectTypeFeatureGuard）は一覧 API で台帳の存在を確かめる。一覧には載っているのに
    // 詳細が 404 を返す（他端末で作り直された等）時は、本体が「見つかりませんでした」を出す。
    server.use(
      http.get(apiPath('/object-types'), () =>
        HttpResponse.json({
          data: [{ ...LEDGER, fieldDefs: undefined, fieldCount: 1 }],
        }),
      ),
      http.get(apiPath('/object-types/:key/records'), () => recordsResponse(['仕入先A'])),
      http.get(apiPath('/object-types/:key'), () =>
        HttpResponse.json(
          { success: false, error: { message: 'ObjectType not found' } },
          { status: 404 },
        ),
      ),
    );

    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() =>
      expect(screen.getByText('指定された台帳は見つかりませんでした。')).toBeInTheDocument(),
    );
    expect(screen.queryByText('データが見つかりませんでした')).not.toBeInTheDocument();
    // 列の無い表に出さない
    expect(screen.queryByText('仕入先A')).not.toBeInTheDocument();
  });

  it('台帳定義の取得に失敗した時は「無い」と断定せず、失敗の表示を出す', async () => {
    // 明細は取れても台帳定義が 500 の時は、404（無い）と同じ扱いにしない（d931）。
    server.use(
      http.get(apiPath('/object-types/:key/records'), () => recordsResponse(['仕入先A'])),
      http.get(apiPath('/object-types/:key'), () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'unavailable' } },
          { status: 500 },
        ),
      ),
    );

    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument());
    expect(screen.queryByText('指定された台帳は見つかりませんでした。')).not.toBeInTheDocument();
    expect(screen.queryByText('仕入先A')).not.toBeInTheDocument();
  });
});
