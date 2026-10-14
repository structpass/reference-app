import { render, screen } from '@testing-library/react';
import { UserRole } from '@struct-pass/shared';
import { RoleGate } from '@/components/shared/role-gate';

const mockUseAuth = vi.fn();
vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('RoleGate', () => {
  it('未ログイン時はnullを返すこと', () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { container } = render(
      <RoleGate>
        <span>children</span>
      </RoleGate>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('ロール制限なしで子要素を表示すること', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'WH_USER' } });
    render(
      <RoleGate>
        <span>表示される</span>
      </RoleGate>,
    );
    expect(screen.getByText('表示される')).toBeInTheDocument();
  });

  it('allowedRolesに含まれるロールで表示すること', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'SYS_ADMIN' } });
    render(
      <RoleGate allowedRoles={[UserRole.SYS_ADMIN, UserRole.OF_ADMIN]}>
        <span>管理者コンテンツ</span>
      </RoleGate>,
    );
    expect(screen.getByText('管理者コンテンツ')).toBeInTheDocument();
  });

  it('allowedRolesに含まれないロールでfallbackを表示すること', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'WH_USER' } });
    render(
      <RoleGate allowedRoles={[UserRole.SYS_ADMIN]} fallback={<span>権限なし</span>}>
        <span>管理者コンテンツ</span>
      </RoleGate>,
    );
    expect(screen.queryByText('管理者コンテンツ')).not.toBeInTheDocument();
    expect(screen.getByText('権限なし')).toBeInTheDocument();
  });

  it('requireAdmin=trueでADMINロールは表示すること', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'SYS_ADMIN' } });
    render(
      <RoleGate requireAdmin>
        <span>管理者のみ</span>
      </RoleGate>,
    );
    expect(screen.getByText('管理者のみ')).toBeInTheDocument();
  });

  it('requireAdmin=trueで非ADMINロールはfallbackを表示すること', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'WH_USER' } });
    render(
      <RoleGate requireAdmin fallback={<span>アクセス拒否</span>}>
        <span>管理者のみ</span>
      </RoleGate>,
    );
    expect(screen.queryByText('管理者のみ')).not.toBeInTheDocument();
    expect(screen.getByText('アクセス拒否')).toBeInTheDocument();
  });

  it('fallback未指定時はnullを返すこと', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'WH_USER' } });
    const { container } = render(
      <RoleGate allowedRoles={[UserRole.SYS_ADMIN]}>
        <span>非表示</span>
      </RoleGate>,
    );
    expect(screen.queryByText('非表示')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('role=null（権限待ち）はrequireAdminでfallbackを表示すること', () => {
    mockUseAuth.mockReturnValue({ user: { role: null } });
    render(
      <RoleGate requireAdmin fallback={<span>アクセス拒否</span>}>
        <span>管理者のみ</span>
      </RoleGate>,
    );
    expect(screen.queryByText('管理者のみ')).not.toBeInTheDocument();
    expect(screen.getByText('アクセス拒否')).toBeInTheDocument();
  });

  it('role=null（権限待ち）はallowedRoles指定でfallbackを表示すること', () => {
    mockUseAuth.mockReturnValue({ user: { role: null } });
    render(
      <RoleGate allowedRoles={[UserRole.SYS_ADMIN]} fallback={<span>権限なし</span>}>
        <span>管理者コンテンツ</span>
      </RoleGate>,
    );
    expect(screen.queryByText('管理者コンテンツ')).not.toBeInTheDocument();
    expect(screen.getByText('権限なし')).toBeInTheDocument();
  });
});
