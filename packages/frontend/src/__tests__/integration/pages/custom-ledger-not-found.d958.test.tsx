// d958: 台帳が「無い」ことと「取得できない」ことを取り違えない。
// 定義が 404 の時は明細の結果（404/200）に関わらず「見つかりませんでした」を出し、
// 定義はあるのに明細が取れない時は失敗表示（再試行）に倒す、を実画面で縛る。
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

const NOT_FOUND = () =>
  HttpResponse.json(
    { success: false, error: { message: 'ObjectType not found' } },
    { status: 404 },
  );

const SERVER_ERROR = () =>
  HttpResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'unavailable' } },
    { status: 500 },
  );

const recordsResponse = (names: string[]) =>
  HttpResponse.json({
    data: names.map((name, i) => ({
      id: i + 1,
      objectTypeId: 10,
      data: { name },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })),
    meta: { total: names.length, page: 1, limit: 200, totalPages: 1 },
  });

/** 門（ObjectTypeFeatureGuard）を通すため、一覧に台帳を載せる。 */
const allowGuard = () =>
  server.use(
    http.get(apiPath('/object-types'), () =>
      HttpResponse.json({ data: [{ ...LEDGER, fieldDefs: undefined, fieldCount: 1 }] }),
    ),
  );

describe('台帳の不在と取得失敗の区別 (d958)', () => {
  it('定義も明細も 404 なら「見つかりませんでした」を出す（取得失敗に化けさせない）', async () => {
    allowGuard();
    server.use(
      http.get(apiPath('/object-types/:key'), NOT_FOUND),
      http.get(apiPath('/object-types/:key/records'), NOT_FOUND),
    );

    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() =>
      expect(screen.getByText('指定された台帳は見つかりませんでした。')).toBeInTheDocument(),
    );
    expect(screen.queryByText('一覧の取得に失敗しました。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  });

  it('定義が 404 で明細だけ 200 でも「見つかりませんでした」を出す（対照）', async () => {
    allowGuard();
    server.use(
      http.get(apiPath('/object-types/:key'), NOT_FOUND),
      http.get(apiPath('/object-types/:key/records'), () => recordsResponse(['仕入先A'])),
    );

    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() =>
      expect(screen.getByText('指定された台帳は見つかりませんでした。')).toBeInTheDocument(),
    );
    expect(screen.queryByText('仕入先A')).not.toBeInTheDocument();
    expect(screen.queryByText('一覧の取得に失敗しました。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  });

  it('定義が 404 で明細が 500 でも「見つかりませんでした」を出す（明細側の失敗に引きずらない）', async () => {
    allowGuard();
    server.use(
      http.get(apiPath('/object-types/:key'), NOT_FOUND),
      http.get(apiPath('/object-types/:key/records'), SERVER_ERROR),
    );

    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() =>
      expect(screen.getByText('指定された台帳は見つかりませんでした。')).toBeInTheDocument(),
    );
    expect(screen.queryByText('一覧の取得に失敗しました。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  });

  it('定義はあって明細が 500 なら失敗表示と再試行を出す（対照・取得不能）', async () => {
    allowGuard();
    let recordCalls = 0;
    server.use(
      http.get(apiPath('/object-types/:key'), () => HttpResponse.json({ data: LEDGER })),
      http.get(apiPath('/object-types/:key/records'), () => {
        recordCalls += 1;
        return SERVER_ERROR();
      }),
    );

    const user = userEvent.setup();
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument());
    expect(screen.queryByText('指定された台帳は見つかりませんでした。')).not.toBeInTheDocument();

    server.resetHandlers();
    allowGuard();
    server.use(
      http.get(apiPath('/object-types/:key'), () => HttpResponse.json({ data: LEDGER })),
      http.get(apiPath('/object-types/:key/records'), () => recordsResponse(['仕入先A'])),
    );
    await user.click(screen.getByRole('button', { name: '再試行' }));
    await waitFor(() => expect(screen.getByText('仕入先A')).toBeInTheDocument());
    expect(recordCalls).toBe(1);
  });

  it('定義はあるのに明細だけ 404 の時は「無い」と断定しない（不整合は失敗として扱う）', async () => {
    allowGuard();
    server.use(
      http.get(apiPath('/object-types/:key'), () => HttpResponse.json({ data: LEDGER })),
      http.get(apiPath('/object-types/:key/records'), NOT_FOUND),
    );

    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument());
    expect(screen.queryByText('指定された台帳は見つかりませんでした。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });
});
