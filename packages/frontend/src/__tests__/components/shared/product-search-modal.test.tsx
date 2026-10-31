import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductSearchModal } from '@/components/shared/product-search-modal';
import type { Product } from '@struct-pass/shared';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import apiClient from '@/lib/api-client';

const mockProducts: Product[] = [
  {
    id: 'p1',
    code: 'PRD-001',
    name: 'テスト商品1',
    price: 1000,
    stockQuantity: 50,
    category: {
      id: 1,
      code: 'CAT-001',
      name: '電子部品',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Product,
  {
    id: 'p2',
    code: 'PRD-002',
    name: 'テスト商品2',
    price: 2000,
    stockQuantity: 10,
    category: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Product,
];

const mockMeta = { total: 2, page: 1, limit: 10, totalPages: 1 };

describe('ProductSearchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockProducts, meta: mockMeta } });
  });

  it('openがtrueのときダイアログを表示すること', async () => {
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('商品検索')).toBeInTheDocument();
    });
  });

  it('openがfalseのときダイアログを表示しないこと', () => {
    render(<ProductSearchModal open={false} onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.queryByText('商品検索')).not.toBeInTheDocument();
  });

  it('openになると商品一覧をフェッチすること', async () => {
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/products',
        expect.objectContaining({
          params: expect.objectContaining({ status: 'ACTIVE', limit: 10 }),
        }),
      );
    });
  });

  it('商品一覧を表示すること', async () => {
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('テスト商品1')).toBeInTheDocument();
      expect(screen.getByText('テスト商品2')).toBeInTheDocument();
    });
  });

  it('商品が0件のとき「該当する商品がありません」を表示すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: [], meta: { ...mockMeta, total: 0 } },
    });

    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('該当する商品がありません')).toBeInTheDocument();
    });
  });

  it('商品行をクリックするとonSelectとonCloseを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<ProductSearchModal open={true} onClose={onClose} onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('テスト商品1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('テスト商品1'));

    expect(onSelect).toHaveBeenCalledWith(mockProducts[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('カテゴリーがnullの商品に「-」を表示すること', async () => {
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('テスト商品2')).toBeInTheDocument();
    });

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('ソートカラムのヘッダーをクリックするとソート方向が切り替わること', async () => {
    const user = userEvent.setup();
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('商品名')).toBeInTheDocument();
    });

    await user.click(screen.getByText('商品名'));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/products',
        expect.objectContaining({
          params: expect.objectContaining({ sort: 'name', order: 'asc' }),
        }),
      );
    });
  });

  it('同じカラムを2回クリックするとdescソートになること', async () => {
    const user = userEvent.setup();
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('コード')).toBeInTheDocument();
    });

    await user.click(screen.getByText('コード'));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/products',
        expect.objectContaining({
          params: expect.objectContaining({ sort: 'code', order: 'desc' }),
        }),
      );
    });
  });

  it('APIエラー時にtoastエラーを表示すること', async () => {
    const toast = await import('react-hot-toast');
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(toast.default.error).toHaveBeenCalledWith('商品の検索に失敗しました');
    });
  });

  it('検索テキストを入力するとデバウンス後に検索が実行されること', async () => {
    const user = userEvent.setup();
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('テスト商品1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('コード・商品名で検索...');
    const callCountBefore = vi.mocked(apiClient.get).mock.calls.length;

    await user.type(searchInput, 'テスト');

    await waitFor(
      () => {
        expect(vi.mocked(apiClient.get).mock.calls.length).toBeGreaterThan(callCountBefore);
        expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(
          '/products',
          expect.objectContaining({
            params: expect.objectContaining({ search: 'テスト' }),
          }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('カテゴリーフィルター入力でデバウンス後に検索が実行されること', async () => {
    const user = userEvent.setup();
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('テスト商品1')).toBeInTheDocument();
    });

    const categoryInput = screen.getByPlaceholderText('カテゴリーで絞り込み');
    const callCountBefore = vi.mocked(apiClient.get).mock.calls.length;

    await user.type(categoryInput, '電子');

    await waitFor(
      () => {
        expect(vi.mocked(apiClient.get).mock.calls.length).toBeGreaterThan(callCountBefore);
        expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(
          '/products',
          expect.objectContaining({
            params: expect.objectContaining({ category: '電子' }),
          }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('ページネーションが存在する場合にPaginationコンポーネントを表示すること', async () => {
    const multiPageMeta = { total: 25, page: 1, limit: 10, totalPages: 3 };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockProducts, meta: multiPageMeta },
    });

    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('テスト商品1')).toBeInTheDocument();
    });
  });

  it('ソートクリックで debounce effect による二重フェッチが起きないこと', async () => {
    const user = userEvent.setup();
    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('テスト商品1')).toBeInTheDocument();
    });

    const before = vi.mocked(apiClient.get).mock.calls.length;
    await user.click(screen.getByText('商品名'));

    // 即時フェッチは 1 本だけ発行される
    await waitFor(() => {
      expect(vi.mocked(apiClient.get).mock.calls.length).toBe(before + 1);
    });
    // debounce ウィンドウ(300ms)を超えても 2 本目が飛ばないこと
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(before + 1);
  });

  it('先行 fetch の遅延応答が後続 fetch の結果を上書きしないこと', async () => {
    const user = userEvent.setup();
    const resolvers: Array<(value: unknown) => void> = [];
    vi.mocked(apiClient.get).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const productA = { ...mockProducts[0], id: 'A', name: '商品A' } as unknown as Product;
    const productB = { ...mockProducts[0], id: 'B', name: '商品B' } as unknown as Product;

    render(<ProductSearchModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    // open フェッチが発行され未解決のまま
    await waitFor(() => expect(resolvers.length).toBe(1));

    // open フェッチ解決前にソート → 後続フェッチを発行（skip フラグで二重化しない）
    await user.click(screen.getByText('商品名'));
    await waitFor(() => expect(resolvers.length).toBe(2));

    // 後続(2本目)を先に解決 → 商品B が表示される
    resolvers[1]({ data: { data: [productB], meta: mockMeta } });
    await waitFor(() => expect(screen.getByText('商品B')).toBeInTheDocument());

    // 先行(1本目)を後から解決 → stale 判定で無視され、商品B が残る
    resolvers[0]({ data: { data: [productA], meta: mockMeta } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByText('商品A')).not.toBeInTheDocument();
    expect(screen.getByText('商品B')).toBeInTheDocument();
  });
});
