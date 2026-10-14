import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDocumentPage } from '@/hooks/use-document-page';

vi.mock('@/lib/api-client', () => ({
  default: {
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

describe('useDocumentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初期状態でtransitioningがfalseであること', () => {
    const { result } = renderHook(() =>
      useDocumentPage({ basePath: '/receivings', entityName: '入荷' }),
    );
    expect(result.current.transitioning).toBe(false);
  });

  describe('confirmDocument', () => {
    it('確定APIを呼びtrueを返すこと', async () => {
      vi.mocked(apiClient.put).mockResolvedValue({ data: {} });

      const { result } = renderHook(() =>
        useDocumentPage({ basePath: '/receivings', entityName: '入荷' }),
      );

      let success: boolean = false;
      await act(async () => {
        success = await result.current.confirmDocument(1);
      });

      expect(success).toBe(true);
      expect(apiClient.put).toHaveBeenCalledWith('/receivings/1/confirm');
      expect(toast.success).toHaveBeenCalledWith('入荷を確定しました');
    });

    it('エラー時にfalseを返すこと', async () => {
      vi.mocked(apiClient.put).mockRejectedValue({
        response: { data: { error: { message: 'DRAFT以外は確定不可' } } },
      });

      const { result } = renderHook(() =>
        useDocumentPage({ basePath: '/receivings', entityName: '入荷' }),
      );

      let success: boolean = true;
      await act(async () => {
        success = await result.current.confirmDocument(1);
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('DRAFT以外は確定不可');
    });
  });

  describe('complete', () => {
    it('完了APIを呼ぶこと', async () => {
      vi.mocked(apiClient.put).mockResolvedValue({ data: {} });

      const { result } = renderHook(() =>
        useDocumentPage({ basePath: '/receivings', entityName: '入荷' }),
      );

      await act(async () => {
        await result.current.complete(1);
      });

      expect(apiClient.put).toHaveBeenCalledWith('/receivings/1/complete');
    });
  });

  describe('ship', () => {
    it('出荷完了APIを呼ぶこと', async () => {
      vi.mocked(apiClient.put).mockResolvedValue({ data: {} });

      const { result } = renderHook(() =>
        useDocumentPage({ basePath: '/shipments', entityName: '出荷' }),
      );

      await act(async () => {
        await result.current.ship(1);
      });

      expect(apiClient.put).toHaveBeenCalledWith('/shipments/1/ship');
    });
  });
});
