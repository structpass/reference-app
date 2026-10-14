import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar';
import { invalidateObjectTypeCatalog } from '@/features/custom-ledger/lib/catalog-events';

/** render ヘルパー: fetchObjectTypes の解決（useEffect の setCustomItems 発火）を act 内で flush し、
 * 「An update to Sidebar was not wrapped in act」警告を消す（ref-0077）。 */
async function renderSidebar() {
  render(<Sidebar />);
  await act(async () => {
    await Promise.resolve();
  });
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    // 静的な台帳管理権限と、動的台帳ごとの権限を分離して検証する。
    canView: (featureId: string) => {
      if (featureId.startsWith('object-type:')) return mockCanViewDynamic;
      return !(featureId === 'object-types' && !mockCanViewObjectTypes);
    },
  }),
}));

// ref-0077: object-types 権限の有無（criteria 1 の出し分け検証用）。
let mockCanViewObjectTypes = true;
let mockCanViewDynamic = true;

// ref-0077: 動的台帳の取得を mock（既定は空＝静的メニューのみ）。
const { fetchObjectTypesMock } = vi.hoisted(() => ({
  fetchObjectTypesMock: vi.fn(),
}));
vi.mock('@/features/custom-ledger/lib/api', () => ({
  fetchObjectTypes: fetchObjectTypesMock,
  fetchObjectTypesStrict: fetchObjectTypesMock,
}));

describe('Sidebar', () => {
  beforeEach(() => {
    fetchObjectTypesMock.mockReset();
    fetchObjectTypesMock.mockResolvedValue([]);
    mockCanViewObjectTypes = true;
    mockCanViewDynamic = true;
  });

  it('サブシステム名（固定 "System"・rete タブ準拠 ref-0024）を h1 で表示すること', async () => {
    await renderSidebar();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('System');
  });

  it('サブタイトル "powered by Struct Pass" を表示しないこと（ref-0030 で撤去）', async () => {
    await renderSidebar();
    expect(screen.queryByText('powered by Struct Pass')).not.toBeInTheDocument();
  });

  it('ダッシュボードリンクを表示しないこと（Rete の Home へ移植済）', async () => {
    await renderSidebar();
    expect(screen.queryByText('ダッシュボード')).not.toBeInTheDocument();
  });

  it('マスタ管理カテゴリを表示すること', async () => {
    await renderSidebar();
    expect(screen.getByText('マスタ管理')).toBeInTheDocument();
  });

  it('カテゴリをクリックで開閉できること', async () => {
    const user = userEvent.setup();
    await renderSidebar();
    const categoryButton = screen.getByText('入出荷管理');

    await user.click(categoryButton);
    expect(categoryButton).toBeInTheDocument();
  });

  it('商品リンクを表示すること', async () => {
    await renderSidebar();
    expect(screen.getByText('商品')).toBeInTheDocument();
  });

  it('canonical preset 5件を専用routeで一度ずつ表示すること', async () => {
    await renderSidebar();

    const master = screen.getByText('マスタ管理').closest('div.mb-1')!;
    const presetLinks = Array.from(master.querySelectorAll('a'))
      .map((link) => link.getAttribute('href'))
      .filter((href) => href?.startsWith('/dashboard/'))
      .filter((href) =>
        [
          '/dashboard/products',
          '/dashboard/warehouses',
          '/dashboard/carriers',
          '/dashboard/suppliers',
          '/dashboard/categories',
        ].includes(href!),
      );
    expect(presetLinks).toEqual([
      '/dashboard/products',
      '/dashboard/warehouses',
      '/dashboard/carriers',
      '/dashboard/suppliers',
      '/dashboard/categories',
    ]);
  });

  it('preset catalogのname/icon/sortOrderだけを反映し、routeはcanonicalを維持すること', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 1,
        key: 'product',
        name: '商品カタログ',
        icon: 'package',
        sortOrder: 20,
        isPreset: true,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 2,
        key: 'warehouse',
        name: '倉庫カタログ',
        icon: 'warehouse',
        sortOrder: 1,
        isPreset: true,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await renderSidebar();

    await waitFor(() => {
      expect(screen.getByText('商品カタログ')).toBeInTheDocument();
      expect(screen.getByText('倉庫カタログ')).toBeInTheDocument();
    });
    expect(screen.queryByText('商品')).not.toBeInTheDocument();
    expect(screen.getByText('商品カタログ').closest('a')?.getAttribute('href')).toBe(
      '/dashboard/products',
    );
    const master = screen.getByText('マスタ管理').closest('div.mb-1')!;
    const presetLinks = Array.from(master.querySelectorAll('a'))
      .map((link) => link.getAttribute('href'))
      .filter((href) =>
        [
          '/dashboard/products',
          '/dashboard/warehouses',
          '/dashboard/carriers',
          '/dashboard/suppliers',
          '/dashboard/categories',
        ].includes(href!),
      );
    expect(presetLinks).toEqual([
      '/dashboard/warehouses',
      '/dashboard/carriers',
      '/dashboard/suppliers',
      '/dashboard/categories',
      '/dashboard/products',
    ]);
  });

  it('preset catalogが部分応答でも欠落分をcanonical fallbackで補うこと', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 1,
        key: 'category',
        name: '分類',
        icon: null,
        sortOrder: 1,
        isPreset: true,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 99,
        key: 'not-canonical',
        name: '未知台帳',
        icon: null,
        sortOrder: 2,
        isPreset: true,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await renderSidebar();

    await waitFor(() => expect(screen.getByText('分類')).toBeInTheDocument());
    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('倉庫')).toBeInTheDocument();
    expect(screen.getByText('運送会社')).toBeInTheDocument();
    expect(screen.getByText('仕入先')).toBeInTheDocument();
    expect(screen.queryByText('未知台帳')).not.toBeInTheDocument();
  });

  it('権限設定リンクを表示すること', async () => {
    await renderSidebar();
    // 全カテゴリはデフォルトで開いている
    expect(screen.getByText('権限設定')).toBeInTheDocument();
  });

  it('自由定義の台帳がマスタ管理の末尾に名前とアイコン付きで並ぶこと（ref-0077 criteria 1）', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 10,
        key: 'supplier-score',
        name: '仕入先評価',
        icon: 'clipboard-check',
        sortOrder: 6,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await renderSidebar();

    await waitFor(() => {
      expect(screen.getByText('仕入先評価')).toBeInTheDocument();
    });
    // リンク先は /dashboard/custom/<key>
    const link = screen.getByText('仕入先評価').closest('a');
    expect(link?.getAttribute('href')).toBe('/dashboard/custom/supplier-score');
  });

  it('プリセット種別は動的項目へ出ない（二重表示しない・ref-0077 criteria 3）', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 1,
        key: 'product',
        name: '商品',
        icon: 'package',
        sortOrder: 1,
        isPreset: true,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 10,
        key: 'supplier-score',
        name: '仕入先評価',
        icon: 'clipboard-check',
        sortOrder: 6,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await renderSidebar();

    await waitFor(() => {
      expect(screen.getByText('仕入先評価')).toBeInTheDocument();
    });
    // プリセット（商品）は動的項目として重複しない（静的な商品 1 つのみ）
    expect(screen.getAllByText('商品')).toHaveLength(1);
  });

  it('台帳の取得に失敗しても左メニューが表示され既存の項目が消えないこと（ref-0077 criteria 4）', async () => {
    fetchObjectTypesMock.mockRejectedValue(new Error('boom'));
    await renderSidebar();

    // 静的項目は表示されたまま
    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('権限設定')).toBeInTheDocument();
    // fetch が実行され、reject が sidebar 側の catch で吸収されるまで待つ
    await waitFor(() => expect(fetchObjectTypesMock).toHaveBeenCalled());
    await vi.waitFor(() => {
      // 動的項目は出ない（取得失敗＝空）
      expect(screen.queryByText('仕入先評価')).not.toBeInTheDocument();
    });
  });

  it('アイコンが未知・未設定でも既定の絵柄で表示され壊れないこと（ref-0077 criteria 6）', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 12,
        key: 'unknown-icon',
        name: '謎の台帳',
        icon: 'no-such-icon',
        sortOrder: 9,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 13,
        key: 'null-icon',
        name: 'アイコン無し',
        icon: null,
        sortOrder: 10,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await renderSidebar();

    await waitFor(() => {
      expect(screen.getByText('謎の台帳')).toBeInTheDocument();
      expect(screen.getByText('アイコン無し')).toBeInTheDocument();
    });
  });

  it('静的な object-types 権限が無くても動的台帳権限があれば左メニューに出る', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 10,
        key: 'supplier-score',
        name: '仕入先評価',
        icon: 'clipboard-check',
        sortOrder: 6,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    mockCanViewObjectTypes = false;
    await renderSidebar();

    await waitFor(() => expect(screen.getByText('仕入先評価')).toBeInTheDocument());
    // 静的な台帳管理リンクだけが権限で消える
    expect(screen.queryByText('台帳管理')).not.toBeInTheDocument();
    // 静的項目（商品）は表示されたまま
    expect(screen.getByText('商品')).toBeInTheDocument();
  });

  it('動的台帳の閲覧権限が無いと左メニューに出ない', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 10,
        key: 'supplier-score',
        name: '仕入先評価',
        icon: 'clipboard-check',
        sortOrder: 6,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    mockCanViewDynamic = false;
    await renderSidebar();

    await waitFor(() => expect(fetchObjectTypesMock).toHaveBeenCalled());
    expect(screen.queryByText('仕入先評価')).not.toBeInTheDocument();
    expect(screen.getByText('商品')).toBeInTheDocument();
  });

  it('動的台帳は sortOrder の並び順で並ぶ（ref-0077 criteria 1）', async () => {
    fetchObjectTypesMock.mockResolvedValue([
      {
        id: 21,
        key: 'z-ledger',
        name: 'Z台帳',
        icon: null,
        sortOrder: 20,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 20,
        key: 'a-ledger',
        name: 'A台帳',
        icon: null,
        sortOrder: 6,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await renderSidebar();

    await waitFor(() => {
      expect(screen.getByText('A台帳')).toBeInTheDocument();
      expect(screen.getByText('Z台帳')).toBeInTheDocument();
    });
    // マスタ管理カテゴリ内で A台帳 → Z台帳 の順（sortOrder 6 → 20）
    const master = screen.getByText('マスタ管理').closest('div.mb-1')!;
    const masterTexts = Array.from(master.querySelectorAll('a')).map((a) => a.textContent);
    const aIdx = masterTexts.findIndex((t) => t?.includes('A台帳'));
    const zIdx = masterTexts.findIndex((t) => t?.includes('Z台帳'));
    expect(aIdx).toBeGreaterThan(-1);
    expect(zIdx).toBeGreaterThan(aIdx);
  });

  // v2-273: 台帳の作成・編集後に Sidebar は再 mount されない（dashboard 共通レイアウトが保持する）。
  // mutation 側の通知で catalog を取り直し、保存結果が同じセッションの左メニューへ出ることを固定する。
  it('台帳の保存通知で catalog を取り直し、新規台帳が左メニューへ出ること（v2-273 criteria 1）', async () => {
    fetchObjectTypesMock.mockResolvedValueOnce([]);
    await renderSidebar();
    expect(screen.queryByText('新規台帳')).not.toBeInTheDocument();

    fetchObjectTypesMock.mockResolvedValueOnce([
      {
        id: 30,
        key: 'new-ledger',
        name: '新規台帳',
        icon: 'clipboard-check',
        sortOrder: 3,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await act(async () => {
      invalidateObjectTypeCatalog();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('新規台帳')).toBeInTheDocument());
    expect(fetchObjectTypesMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('新規台帳').closest('a')?.getAttribute('href')).toBe(
      '/dashboard/custom/new-ledger',
    );
  });

  it('保存通知でも閲覧権限の無い台帳は左メニューへ出ないこと（v2-273 criteria 2・fail-closed 維持）', async () => {
    fetchObjectTypesMock.mockResolvedValueOnce([]);
    await renderSidebar();

    mockCanViewDynamic = false;
    fetchObjectTypesMock.mockResolvedValueOnce([
      {
        id: 31,
        key: 'hidden-ledger',
        name: '権限なし台帳',
        icon: null,
        sortOrder: 4,
        isPreset: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await act(async () => {
      invalidateObjectTypeCatalog();
      await Promise.resolve();
    });

    await waitFor(() => expect(fetchObjectTypesMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('権限なし台帳')).not.toBeInTheDocument();
    expect(screen.getByText('商品')).toBeInTheDocument();
  });

  it('unmount 後は保存通知を受けても catalog を取り直さないこと', async () => {
    fetchObjectTypesMock.mockResolvedValueOnce([]);
    const view = render(<Sidebar />);
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();

    await act(async () => {
      invalidateObjectTypeCatalog();
      await Promise.resolve();
    });

    expect(fetchObjectTypesMock).toHaveBeenCalledTimes(1);
  });
});
