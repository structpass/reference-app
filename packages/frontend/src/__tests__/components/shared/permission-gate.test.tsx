import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionGate } from '@/components/shared/permission-gate';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}));

import { usePermissions } from '@/hooks/use-permissions';

describe('PermissionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ロード前にはnullを返すこと', () => {
    vi.mocked(usePermissions).mockReturnValue({
      permissions: [],
      loaded: false,
      error: false,
      canView: vi.fn().mockReturnValue(true),
      canCreate: vi.fn().mockReturnValue(true),
      canUpdate: vi.fn().mockReturnValue(true),
      canDelete: vi.fn().mockReturnValue(true),
    });

    const { container } = render(
      <PermissionGate featureId="products" action="view">
        <div>コンテンツ</div>
      </PermissionGate>,
    );

    expect(container.innerHTML).toBe('');
  });

  it('権限がある場合にchildrenを表示すること', () => {
    vi.mocked(usePermissions).mockReturnValue({
      permissions: [],
      loaded: true,
      error: false,
      canView: vi.fn().mockReturnValue(true),
      canCreate: vi.fn().mockReturnValue(true),
      canUpdate: vi.fn().mockReturnValue(true),
      canDelete: vi.fn().mockReturnValue(true),
    });

    render(
      <PermissionGate featureId="products" action="view">
        <div>コンテンツ</div>
      </PermissionGate>,
    );

    expect(screen.getByText('コンテンツ')).toBeInTheDocument();
  });

  it('権限がない場合にfallbackを表示すること', () => {
    vi.mocked(usePermissions).mockReturnValue({
      permissions: [],
      loaded: true,
      error: false,
      canView: vi.fn().mockReturnValue(false),
      canCreate: vi.fn().mockReturnValue(false),
      canUpdate: vi.fn().mockReturnValue(false),
      canDelete: vi.fn().mockReturnValue(false),
    });

    render(
      <PermissionGate
        featureId="products"
        action="view"
        fallback={<div>アクセス権限がありません</div>}
      >
        <div>コンテンツ</div>
      </PermissionGate>,
    );

    expect(screen.queryByText('コンテンツ')).not.toBeInTheDocument();
    expect(screen.getByText('アクセス権限がありません')).toBeInTheDocument();
  });

  it('createアクションの権限チェックが行われること', () => {
    const mockCanCreate = vi.fn().mockReturnValue(false);
    vi.mocked(usePermissions).mockReturnValue({
      permissions: [],
      loaded: true,
      error: false,
      canView: vi.fn().mockReturnValue(true),
      canCreate: mockCanCreate,
      canUpdate: vi.fn().mockReturnValue(true),
      canDelete: vi.fn().mockReturnValue(true),
    });

    render(
      <PermissionGate featureId="products" action="create">
        <div>登録フォーム</div>
      </PermissionGate>,
    );

    expect(mockCanCreate).toHaveBeenCalledWith('products');
    expect(screen.queryByText('登録フォーム')).not.toBeInTheDocument();
  });

  it('deleteアクションの権限チェックが行われること', () => {
    const mockCanDelete = vi.fn().mockReturnValue(true);
    vi.mocked(usePermissions).mockReturnValue({
      permissions: [],
      loaded: true,
      error: false,
      canView: vi.fn().mockReturnValue(true),
      canCreate: vi.fn().mockReturnValue(true),
      canUpdate: vi.fn().mockReturnValue(true),
      canDelete: mockCanDelete,
    });

    render(
      <PermissionGate featureId="orders" action="delete">
        <button>削除ボタン</button>
      </PermissionGate>,
    );

    expect(mockCanDelete).toHaveBeenCalledWith('orders');
    expect(screen.getByText('削除ボタン')).toBeInTheDocument();
  });
});
