import { renderHook, act, waitFor } from '@testing-library/react';
import { useSystemSettings } from '@/features/system-settings/hooks/use-system-settings';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

const settings = {
  data: {
    data: [
      { key: 'company_name', value: 'Struct Pass', valueType: 'STRING' },
      { key: 'system.ui.theme', value: 'default', valueType: 'STRING' },
    ],
  },
};

describe('useSystemSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(settings);
  });

  it('初期ロードで GET /system-settings が呼ばれ settings が設定されること', async () => {
    const { result } = renderHook(() => useSystemSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiClient.get).toHaveBeenCalledWith('/system-settings');
    expect(result.current.settings).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('bulkUpdate は PUT /system-settings へ { updates } の形で送り、成功後に再取得されること', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useSystemSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const getCallsBefore = vi.mocked(apiClient.get).mock.calls.length;

    await act(async () => {
      await result.current.bulkUpdate([{ key: 'company_name', value: '新社名' }]);
    });

    expect(apiClient.put).toHaveBeenCalledWith('/system-settings', {
      updates: [{ key: 'company_name', value: '新社名' }],
    });
    // 保存成功後は refetch（再取得）される
    await waitFor(() =>
      expect(vi.mocked(apiClient.get).mock.calls.length).toBe(getCallsBefore + 1),
    );
  });

  it('bulkUpdate が失敗すると reject が伝播し error 状態には入らないこと', async () => {
    vi.mocked(apiClient.put).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useSystemSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.bulkUpdate([{ key: 'company_name', value: '新社名' }]);
      }),
    ).rejects.toThrow('network error');

    // 保存失敗は bulkUpdate の reject に委ね、フックの error 状態（取得系）は更新しない
    expect(result.current.error).toBeNull();
  });

  it('取得が失敗すると error にメッセージが入り loading が終わること', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('fetch failed'));
    const { result } = renderHook(() => useSystemSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('fetch failed');
    expect(result.current.settings).toEqual([]);
  });

  it('reload を呼ぶと再取得されること', async () => {
    const { result } = renderHook(() => useSystemSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const getCallsBefore = vi.mocked(apiClient.get).mock.calls.length;

    await act(async () => {
      await result.current.reload();
    });

    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(getCallsBefore + 1);
  });
});
