import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';
import toast from 'react-hot-toast';
import {
  usePermissionMatrix,
  buildMatrix,
  SYS_ADMIN_ONLY_FEATURES,
  type PermissionRoleRow,
} from '@/features/permissions/lib/use-permission-matrix';
import { buildLogicalFeatures } from '@/features/permissions/lib/feature-list';

describe('buildMatrix', () => {
  it('全機能×全ロールを初期化し SYS_ADMIN のみ全 ON にすること', () => {
    const m = buildMatrix([]);
    expect(m['products']).toBeDefined();
    expect(m['products']['SYS_ADMIN']).toEqual({
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    });
    expect(m['products']['WH_USER']).toEqual({
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
  });

  it('DB 行で該当セルを上書きすること', () => {
    const rows: PermissionRoleRow[] = [
      {
        role: 'WH_USER',
        featureId: 'products',
        canView: true,
        canCreate: true,
        canUpdate: false,
        canDelete: false,
      },
    ];
    const m = buildMatrix(rows);
    expect(m['products']['WH_USER']).toEqual({
      canView: true,
      canCreate: true,
      canUpdate: false,
      canDelete: false,
    });
  });

  it('動的台帳は閲覧OFFなら書込権限もOFFに正規化すること', () => {
    const features = buildLogicalFeatures([
      { key: 'supplier-score', name: '仕入先評価', sortOrder: 6, isPreset: false },
    ]);
    const m = buildMatrix(
      [
        {
          role: 'WH_USER',
          featureId: 'object-type:supplier-score',
          canView: false,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      ],
      features,
    );

    expect(m['object-type:supplier-score']['WH_USER']).toEqual({
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
  });
});

describe('SYS_ADMIN_ONLY_FEATURES — 集合の一致（v2-274）', () => {
  // backend の role-permissions.constants.ts（SYS_ADMIN_ONLY_FEATURES）・seed
  // （prisma/seed/permissions.ts）と同じ3機能を指すことを frontend 側から固定する。
  // backend の constants spec は「既定で全ロール NONE の機能」との一致を、backend の
  // seed-permissions.spec.ts は seed 分類との一致を見る。frontend 側の固定が欠けると、
  // frontend だけ集合から外しても気付けず、固定 OFF の表示と実効権限がずれる。
  const EXPECTED = ['object-types', 'permissions', 'system-parameters'];

  it('backend / seed と同じ3機能を指すこと', () => {
    expect([...SYS_ADMIN_ONLY_FEATURES].sort()).toEqual([...EXPECTED].sort());
  });

  it('集合の各機能が matrix 上で SYS_ADMIN のみ全 ON に固定されること', () => {
    // DB に不整合な全 ON 行があっても matrix は固定 OFF を維持する（保存 API の拒否だけでは
    // 修正前に書かれた行が残る環境で漏れるため、表示側でも止める）。
    const m = buildMatrix([
      {
        role: 'WH_USER',
        featureId: 'object-types',
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      },
    ]);

    for (const featureId of SYS_ADMIN_ONLY_FEATURES) {
      expect(m[featureId]?.['SYS_ADMIN']).toEqual({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
      for (const role of ['WH_USER', 'WH_ADMIN', 'OF_USER', 'OF_ADMIN']) {
        expect(m[featureId]?.[role]).toEqual({
          canView: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        });
      }
    }
  });

  it('専用機能の集合に動的台帳を含めないこと（委任を塞がない）', () => {
    for (const featureId of SYS_ADMIN_ONLY_FEATURES) {
      expect(featureId.startsWith('object-type:')).toBe(false);
    }
    // ユーザー定義台帳は object-type:<key> 形式で委任できる（専用集合に巻き込まない）。
    expect(SYS_ADMIN_ONLY_FEATURES.has('object-type:supplier-score')).toBe(false);
  });
});

describe('usePermissionMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初期化時にローディング状態であること', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePermissionMatrix());
    expect(result.current.loading).toBe(true);
  });

  it('取得後に matrix が埋まり loading=false / dirty=false になること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const { result } = renderHook(() => usePermissionMatrix());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dirty).toBe(false);
    expect(result.current.matrix['products']).toBeDefined();
  });

  it('catalogの非preset台帳を動的featureとして同じ世代で読み込むこと', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === '/permissions/roles') {
        return { data: { data: [] } } as never;
      }
      return {
        data: {
          data: [
            {
              id: 10,
              key: 'supplier-score',
              name: '仕入先評価',
              icon: null,
              sortOrder: 6,
              isPreset: false,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
      } as never;
    });
    const { result } = renderHook(() => usePermissionMatrix());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.features).toContainEqual(
      expect.objectContaining({ id: 'object-type:supplier-score', name: '仕入先評価' }),
    );
    expect(result.current.matrix['object-type:supplier-score']).toBeDefined();
  });

  it('取得失敗時にエラートーストを表示すること', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    renderHook(() => usePermissionMatrix());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('権限情報の取得に失敗しました'));
  });

  it('編集可能セルの toggle で dirty=true となり値が反転すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dirty).toBe(false);
    act(() => {
      result.current.handleToggle('products', 'WH_USER', 'canView');
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.matrix['products']['WH_USER'].canView).toBe(true);
  });

  it('SYS_ADMIN の toggle は無視されること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleToggle('products', 'SYS_ADMIN', 'canView');
    });
    expect(result.current.dirty).toBe(false);
  });

  it('SYS_ADMIN 専用機能 (permissions 等) は他 role でも toggle 不可であること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleToggle('permissions', 'WH_USER', 'canView');
    });
    expect(result.current.dirty).toBe(false);
  });

  it('動的台帳は閲覧ON前の書込toggleを無視し、閲覧OFFで書込をクリアすること', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === '/permissions/roles') {
        return { data: { data: [] } } as never;
      }
      return {
        data: {
          data: [
            {
              id: 10,
              key: 'supplier-score',
              name: '仕入先評価',
              icon: null,
              sortOrder: 6,
              isPreset: false,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
      } as never;
    });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleToggle('object-type:supplier-score', 'WH_USER', 'canCreate');
    });
    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.handleToggle('object-type:supplier-score', 'WH_USER', 'canView');
    });
    act(() => {
      result.current.handleToggle('object-type:supplier-score', 'WH_USER', 'canCreate');
    });
    expect(result.current.matrix['object-type:supplier-score']['WH_USER']).toMatchObject({
      canView: true,
      canCreate: true,
    });

    act(() => {
      result.current.handleToggle('object-type:supplier-score', 'WH_USER', 'canView');
    });
    expect(result.current.matrix['object-type:supplier-score']['WH_USER']).toEqual({
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
  });

  it('dirty でない時は保存 API を呼ばないこと', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSave();
    });
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('保存成功時に成功トーストを表示し dirty=false に戻すこと', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleToggle('products', 'WH_USER', 'canView');
    });
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      await result.current.handleSave();
    });

    expect(apiClient.put).toHaveBeenCalledWith('/permissions/roles', expect.any(Object));
    expect(toast.success).toHaveBeenCalledWith('権限を保存しました');
    expect(result.current.dirty).toBe(false);
  });

  it('保存payloadでも閲覧OFFの動的台帳に書込権限を送らないこと', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === '/permissions/roles') {
        return {
          data: {
            data: [
              {
                role: 'WH_USER',
                featureId: 'object-type:supplier-score',
                canView: false,
                canCreate: true,
                canUpdate: true,
                canDelete: true,
              },
            ],
          },
        } as never;
      }
      return {
        data: {
          data: [
            {
              id: 10,
              key: 'supplier-score',
              name: '仕入先評価',
              icon: null,
              sortOrder: 6,
              isPreset: false,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
      } as never;
    });
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleToggle('object-type:supplier-score', 'WH_USER', 'canView');
    });
    act(() => {
      result.current.handleToggle('object-type:supplier-score', 'WH_USER', 'canCreate');
    });
    act(() => {
      result.current.handleToggle('object-type:supplier-score', 'WH_USER', 'canView');
    });
    await act(async () => {
      await result.current.handleSave();
    });

    const payload = vi.mocked(apiClient.put).mock.calls[0]?.[1] as {
      permissions: PermissionRoleRow[];
    };
    const saved = payload.permissions.find(
      (permission) =>
        permission.featureId === 'object-type:supplier-score' && permission.role === 'WH_USER',
    );
    expect(saved).toMatchObject({
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
  });

  it('保存失敗時にエラートーストを表示すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockRejectedValue(new Error('Save error'));
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleToggle('products', 'WH_USER', 'canView');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(toast.error).toHaveBeenCalledWith('権限の保存に失敗しました');
  });

  it('permissionsまたはcatalogの取得失敗時はmatrixを空にして保存不可にすること', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => usePermissionMatrix());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.features).toEqual([]);
    expect(result.current.matrix).toEqual({});
    expect(result.current.dirty).toBe(false);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('reload中に古い応答が新しいmatrixを上書きしないこと', async () => {
    let resolveFirstPermissions!: (value: unknown) => void;
    let resolveFirstCatalog!: (value: unknown) => void;
    const firstPermissions = new Promise((resolve) => {
      resolveFirstPermissions = resolve;
    });
    const firstCatalog = new Promise((resolve) => {
      resolveFirstCatalog = resolve;
    });
    let callCount = 0;
    vi.mocked(apiClient.get).mockImplementation((path) => {
      callCount += 1;
      if (callCount === 1) return firstPermissions as never;
      if (callCount === 2) return firstCatalog as never;
      if (path === '/permissions/roles') return Promise.resolve({ data: { data: [] } }) as never;
      return Promise.resolve({
        data: {
          data: [
            {
              id: 10,
              key: 'new-ledger',
              name: '新台帳',
              icon: null,
              sortOrder: 6,
              isPreset: false,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
      }) as never;
    });
    const { result } = renderHook(() => usePermissionMatrix());
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));

    act(() => {
      void result.current.reload();
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(result.current.features[18]?.id).toBe('object-type:new-ledger'));

    resolveFirstPermissions({ data: { data: [] } });
    resolveFirstCatalog({
      data: {
        data: [
          {
            id: 11,
            key: 'old-ledger',
            name: '旧台帳',
            icon: null,
            sortOrder: 6,
            isPreset: false,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.features.some((feature) => feature.id === 'object-type:old-ledger')).toBe(
      false,
    );
  });
});
