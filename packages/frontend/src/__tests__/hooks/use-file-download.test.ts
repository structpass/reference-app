import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileDownload } from '@/hooks/use-file-download';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
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

describe('useFileDownload', () => {
  const mockClick = vi.fn();
  const mockRemove = vi.fn();
  const mockSetAttribute = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createElementSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appendChildSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
    });

    const mockAnchor = {
      href: '',
      setAttribute: mockSetAttribute,
      click: mockClick,
      remove: mockRemove,
    } as unknown as HTMLAnchorElement;

    // Save real implementation before spying
    const realCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement');
    createElementSpy.mockImplementation((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return realCreateElement(tag, options);
    });

    appendChildSpy = vi.spyOn(document.body, 'appendChild');
    appendChildSpy.mockImplementation((node: Node) => node);
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
  });

  it('ファイルをダウンロードすること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['test']) });

    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.download('/stocks/csv', 'stocks.csv');
    });

    expect(apiClient.get).toHaveBeenCalledWith('/stocks/csv', {
      params: undefined,
      responseType: 'blob',
    });
    expect(mockClick).toHaveBeenCalled();
    expect(mockSetAttribute).toHaveBeenCalledWith('download', 'stocks.csv');
    expect(toast.success).toHaveBeenCalledWith('ファイルをダウンロードしました');
  });

  it('エラー時にtoastを表示すること', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Download failed'));

    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.download('/stocks/csv', 'stocks.csv');
    });

    expect(toast.error).toHaveBeenCalledWith('ダウンロードに失敗しました');
  });

  it('downloadText はサーバー fetch なしで文字列をダウンロードすること', () => {
    const { result } = renderHook(() => useFileDownload());

    act(() => {
      result.current.downloadText('行番号,列,理由\r\n1,価格,NG', 'errors.csv');
    });

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockSetAttribute).toHaveBeenCalledWith('download', 'errors.csv');
    expect(toast.success).toHaveBeenCalledWith('ファイルをダウンロードしました');
  });
});
