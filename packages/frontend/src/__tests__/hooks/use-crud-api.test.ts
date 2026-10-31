import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCrudApi } from '@/hooks/use-crud-api';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
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

describe('useCrudApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初期状態が正しいこと', () => {
    const { result } = renderHook(() => useCrudApi('/test', 'テスト'));
    expect(result.current.items).toEqual([]);
    expect(result.current.meta).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  describe('fetchAll', () => {
    it('一覧を取得しstateを更新すること', async () => {
      const mockData = [{ id: 1, name: 'item1' }];
      const mockMeta = { total: 1, page: 1, limit: 20, totalPages: 1 };
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { data: mockData, meta: mockMeta },
      });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      await act(async () => {
        await result.current.fetchAll();
      });

      expect(result.current.items).toEqual(mockData);
      expect(result.current.meta).toEqual(mockMeta);
      expect(result.current.loading).toBe(false);
    });

    it('エラー時にtoastを表示すること', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      await act(async () => {
        await result.current.fetchAll();
      });

      expect(toast.error).toHaveBeenCalledWith('テスト一覧の取得に失敗しました');
    });

    // d600: 取得に失敗しても items は空のままなので、loadError を立てないと
    // 画面は「見つかりませんでした」（正常な 0 件）と同じ表示になってしまう。
    it('取得失敗で loadError が立ち、再取得成功で戻ること', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));
      expect(result.current.loadError).toBe(false);

      await act(async () => {
        await result.current.fetchAll();
      });
      expect(result.current.loadError).toBe(true);
      expect(result.current.initialized).toBe(true);

      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: [], meta: null } });
      await act(async () => {
        await result.current.fetchAll();
      });
      expect(result.current.loadError).toBe(false);
    });

    it('取得失敗で既に持っている行は消さないこと', async () => {
      const mockData = [{ id: 1, name: 'item1' }];
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockData, meta: null } });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));
      await act(async () => {
        await result.current.fetchAll();
      });

      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));
      await act(async () => {
        await result.current.fetchAll();
      });

      expect(result.current.loadError).toBe(true);
      expect(result.current.items).toEqual(mockData);
    });
  });

  describe('fetchOne', () => {
    it('単一データを返すこと', async () => {
      const mockItem = { id: 1, name: 'item1' };
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockItem } });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      let item: unknown;
      await act(async () => {
        item = await result.current.fetchOne(1);
      });

      expect(item).toEqual(mockItem);
    });

    // d864: 失敗を null に潰すと、呼び元（useFetchOne）が「見つからない」と取り違える。
    // 失敗は読み取りの失敗として投げ、画面には失敗の案内を出す。
    it('エラー時は投げ、取得失敗の案内を出すこと', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      await act(async () => {
        await expect(result.current.fetchOne(999)).rejects.toThrow();
      });

      expect(toast.error).toHaveBeenCalled();
      expect(result.current.fetchOneError).toBe(true);
    });

    // d600: 一覧（fetchAll）と詳細（fetchOne）を同じ画面で使う編集画面で、
    // 詳細だけの失敗が一覧側の表示を巻き込まないよう、失敗の状態を経路ごとに分ける。
    it('取得失敗は fetchOneError に立ち、fetchAll の loadError とは混ざらないこと', async () => {
      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: [], meta: null } });
      await act(async () => {
        await result.current.fetchAll();
      });

      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Not found'));
      await act(async () => {
        await expect(result.current.fetchOne(999)).rejects.toThrow();
      });

      expect(result.current.fetchOneError).toBe(true);
      expect(result.current.loadError).toBe(false);

      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: { id: 999 } } });
      await act(async () => {
        await result.current.fetchOne(999);
      });
      expect(result.current.fetchOneError).toBe(false);
    });
  });

  describe('create', () => {
    it('成功時にtrueを返しtoastを表示すること', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      let success: boolean = false;
      await act(async () => {
        success = await result.current.create({ name: 'new' });
      });

      expect(success).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('テストを登録しました');
    });

    it('エラー時にfalseを返すこと', async () => {
      vi.mocked(apiClient.post).mockRejectedValue({
        response: { data: { error: { message: 'コード重複' } } },
      });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      let success: boolean = true;
      await act(async () => {
        success = await result.current.create({ name: 'dup' });
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('コード重複');
    });
  });

  describe('update', () => {
    it('成功時にtrueを返すこと', async () => {
      vi.mocked(apiClient.put).mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      let success: boolean = false;
      await act(async () => {
        success = await result.current.update(1, { name: 'updated' });
      });

      expect(success).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('更新が完了しました');
    });

    it('エラー時にfalseを返しエラーメッセージを表示すること', async () => {
      vi.mocked(apiClient.put).mockRejectedValue({
        response: { data: { error: { message: '更新に失敗' } } },
      });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      let success: boolean = true;
      await act(async () => {
        success = await result.current.update(1, { name: 'updated' });
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('更新に失敗');
    });
  });

  describe('remove', () => {
    it('成功時にtrueを返すこと', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      let success: boolean = false;
      await act(async () => {
        success = await result.current.remove(1);
      });

      expect(success).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('テストを削除しました');
    });

    it('エラー時にfalseを返しエラーメッセージを表示すること', async () => {
      vi.mocked(apiClient.delete).mockRejectedValue(new Error('Delete error'));

      const { result } = renderHook(() => useCrudApi('/test', 'テスト'));

      let success: boolean = true;
      await act(async () => {
        success = await result.current.remove(1);
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('テストの削除に失敗しました');
    });

    // v2-424: 拒否の理由（409「掲示の宛先に指定されているため削除できません」等）は API が返す。
    // 汎用文言に潰すと、操作者が次に取る一手（宛先の変更依頼）が画面から消える。
    it('拒否された時はAPIの理由を表示すること', async () => {
      vi.mocked(apiClient.delete).mockRejectedValue({
        response: {
          status: 409,
          data: {
            error: {
              message:
                'このグループは掲示の宛先に指定されているため削除できません。宛先の変更はシステム管理者へご依頼ください',
            },
          },
        },
      });

      const { result } = renderHook(() => useCrudApi('/groups', 'グループ'));

      let success: boolean = true;
      await act(async () => {
        success = await result.current.remove(3);
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        'このグループは掲示の宛先に指定されているため削除できません。宛先の変更はシステム管理者へご依頼ください',
      );
    });
  });
});
