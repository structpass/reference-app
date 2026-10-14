import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ProductStatus } from '@struct-pass/shared';
import { useProducts } from '@/features/products/hooks/use-products';
import { makeProduct } from '@/__tests__/factories';

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

describe('useProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchProduct', () => {
    it('単一商品を返す（Product DTO shape を保つ）', async () => {
      const mockProduct = makeProduct({ id: 'prod-1', code: 'PRD-001', name: '商品A' });
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockProduct } });

      const { result } = renderHook(() => useProducts());

      let product: unknown;
      await act(async () => {
        product = await result.current.fetchProduct('prod-1');
      });

      // shape 検証: 主要 field が DTO 通り返ること
      expect(product).toMatchObject({
        id: 'prod-1',
        code: 'PRD-001',
        name: '商品A',
        price: 1000,
        status: ProductStatus.ACTIVE,
        category: { id: 1, code: 'C-001' },
      });
    });

    it('エラー時にnullを返すこと', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useProducts());

      let product: unknown;
      await act(async () => {
        product = await result.current.fetchProduct('999');
      });

      expect(product).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('商品の取得に失敗しました');
    });
  });

  describe('createProduct', () => {
    it('成功時にtrueを返しトーストを表示すること', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useProducts());

      let success: boolean = false;
      await act(async () => {
        success = await result.current.createProduct({ code: 'P-001', name: '商品A' } as never);
      });

      expect(success).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('商品を登録しました');
    });

    it('エラー時にfalseを返しエラーメッセージを表示すること', async () => {
      vi.mocked(apiClient.post).mockRejectedValue({
        response: { data: { error: { message: 'コードが重複しています' } } },
      });

      const { result } = renderHook(() => useProducts());

      let success: boolean = true;
      await act(async () => {
        success = await result.current.createProduct({ code: 'P-001', name: '商品A' } as never);
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('コードが重複しています');
    });

    it('エラーレスポンスにメッセージがない場合にデフォルトメッセージを表示すること', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Network'));

      const { result } = renderHook(() => useProducts());

      await act(async () => {
        await result.current.createProduct({ code: 'P-001', name: '商品A' } as never);
      });

      expect(toast.error).toHaveBeenCalledWith('商品の登録に失敗しました');
    });
  });

  describe('updateProduct', () => {
    it('成功時にtrueを返すこと', async () => {
      vi.mocked(apiClient.put).mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useProducts());

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updateProduct('1', { name: '更新商品' } as never);
      });

      expect(success).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('更新が完了しました');
    });

    it('エラー時にfalseを返すこと', async () => {
      vi.mocked(apiClient.put).mockRejectedValue({
        response: { data: { error: { message: '更新失敗' } } },
      });

      const { result } = renderHook(() => useProducts());

      let success: boolean = true;
      await act(async () => {
        success = await result.current.updateProduct('1', { name: '更新商品' } as never);
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('更新失敗');
    });
  });

  describe('deleteProduct', () => {
    it('成功時にtrueを返すこと', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useProducts());

      let success: boolean = false;
      await act(async () => {
        success = await result.current.deleteProduct('1');
      });

      expect(success).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('商品を削除しました');
    });

    it('エラー時にfalseを返すこと', async () => {
      vi.mocked(apiClient.delete).mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() => useProducts());

      let success: boolean = true;
      await act(async () => {
        success = await result.current.deleteProduct('1');
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('商品の削除に失敗しました');
    });
  });
});
