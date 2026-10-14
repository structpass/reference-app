import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

/** 自由定義のデモ台帳（ref-0078・開発用 seed と同形）。 */
const DEMO_LEDGER = {
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
    {
      id: 2,
      objectTypeId: 10,
      key: 'rating',
      label: '評価点',
      type: 'NUMBER',
      required: false,
      sortOrder: 2,
    },
    {
      id: 3,
      objectTypeId: 10,
      key: 'reviewedOn',
      label: '評価日',
      type: 'DATE',
      required: false,
      sortOrder: 3,
    },
  ],
};

/** データ 0 件の非プリセット台帳（ref-0078 criteria 2・0 件表示の検証用）。 */
const EMPTY_LEDGER = {
  id: 11,
  key: 'vendor-audit',
  name: '取引先監査',
  icon: 'file-check',
  sortOrder: 7,
  isPreset: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  fieldDefs: [
    {
      id: 4,
      objectTypeId: 11,
      key: 'name',
      label: '取引先名',
      type: 'TEXT',
      required: true,
      sortOrder: 1,
    },
  ],
};

const PRESET_LEDGER = {
  id: 1,
  key: 'product',
  name: '商品',
  icon: 'package',
  sortOrder: 1,
  isPreset: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  fieldDefs: [],
};

// ページ遷移を検証できるよう 51 件（limit 50 → 2 ページ）にする。
// reviewedOn は実在する日付にする（"2026-08-51" のような繰り上がりは DATE 項目の検証に落ちる）。
const DAY_MS = 86400000;
const DEMO_RECORDS = Array.from({ length: 51 }, (_, i) => {
  const n = i + 1;
  return {
    id: n,
    objectTypeId: 10,
    data: {
      name: `仕入先${String(n).padStart(2, '0')}`,
      rating: 60 + ((n * 7) % 40),
      reviewedOn: new Date(Date.UTC(2026, 7, 1) + n * DAY_MS).toISOString().slice(0, 10),
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
});

/** 一覧取得が失敗するハンドラ（失敗と正常な 0 件の区別を検証する spec 用）。 */
export const objectTypesRecordsErrorHandler = http.get(apiPath('/object-types/:key/records'), () =>
  HttpResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'records unavailable' } },
    { status: 500 },
  ),
);

/** レコード単体取得だけが失敗するハンドラ（編集画面の読み込み失敗表示の検証用）。 */
export const customRecordErrorHandler = http.get(apiPath('/object-types/:key/records/:id'), () =>
  HttpResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'record unavailable' } },
    { status: 500 },
  ),
);

/**
 * 一覧取得の応答を release() まで止めておくハンドラ（再試行中のボタン無効と重複取得の
 * 検証用）。時間待ちだと遅い環境で結果が先に届き assertion が揺れるため、明示的に解放する。
 */
export function objectTypesRecordsGatedHandler() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const handler = http.get(apiPath('/object-types/:key/records'), async ({ request }) => {
    calls += 1;
    await gate;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const slice = DEMO_RECORDS.slice((page - 1) * limit, (page - 1) * limit + limit);
    return HttpResponse.json({
      data: slice,
      meta: {
        total: DEMO_RECORDS.length,
        page,
        limit,
        totalPages: Math.ceil(DEMO_RECORDS.length / limit),
      },
    });
  });
  return { handler, release, calls: () => calls };
}

/** レコード更新（保存後の一覧復帰を検証する spec 用）。 */
export const updateCustomRecordHandler = http.put(
  apiPath('/object-types/:key/records/:id'),
  async ({ params, request }) => {
    const body = (await request.json()) as { data: Record<string, unknown> };
    const record = DEMO_RECORDS.find((item) => item.id === Number(params.id));
    if (!record) {
      return HttpResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'CustomRecord not found' } },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      data: { ...record, data: body.data, updatedAt: '2026-08-02T00:00:00.000Z' },
    });
  },
);

export const objectTypesHandler = [
  http.get(apiPath('/object-types'), () =>
    HttpResponse.json({
      data: [{ ...PRESET_LEDGER }, { ...DEMO_LEDGER }, { ...EMPTY_LEDGER }],
    }),
  ),
  // 単体取得（backend GET /object-types/:key/records/:id）。一覧のページ窓を経由しない経路なので、
  // 2 ページ目以降（51 件目〜）のレコードもここで解決できる。
  http.get(apiPath('/object-types/:key/records/:id'), ({ params }) => {
    const key = String(params.key);
    const id = Number(params.id);
    const notFound = () =>
      HttpResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'CustomRecord not found' } },
        { status: 404 },
      );
    if (key === 'product' || key === 'missing' || key === 'vendor-audit') return notFound();
    const record = DEMO_RECORDS.find((item) => item.id === id);
    if (!record) return notFound();
    return HttpResponse.json({ data: record });
  }),
  http.get(apiPath('/object-types/:key/records'), ({ params, request }) => {
    const key = String(params.key);
    if (key === 'product' || key === 'missing' || key === 'vendor-audit') {
      return HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } });
    }
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const slice = DEMO_RECORDS.slice((page - 1) * limit, (page - 1) * limit + limit);
    return HttpResponse.json({
      data: slice,
      meta: {
        total: DEMO_RECORDS.length,
        page,
        limit,
        totalPages: Math.ceil(DEMO_RECORDS.length / limit),
      },
    });
  }),
  http.get(apiPath('/object-types/:key'), ({ params }) => {
    const key = String(params.key);
    if (key === 'supplier-score') {
      return HttpResponse.json({ data: DEMO_LEDGER });
    }
    if (key === 'vendor-audit') {
      return HttpResponse.json({ data: EMPTY_LEDGER });
    }
    if (key === 'product') {
      return HttpResponse.json({ data: PRESET_LEDGER });
    }
    if (key === 'missing') {
      return HttpResponse.json(
        { success: false, error: { message: 'ObjectType not found' } },
        { status: 404 },
      );
    }
    return HttpResponse.json(
      { success: false, error: { message: 'ObjectType not found' } },
      { status: 404 },
    );
  }),
  updateCustomRecordHandler,
];
