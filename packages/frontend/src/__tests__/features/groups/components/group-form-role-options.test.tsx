import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@struct-pass/shared';
import { GroupForm } from '@/features/groups/components/group-form';
import { selectableGroupRoles } from '@/features/groups/lib/group-role-scope';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

function loginAs(role: UserRole | null) {
  mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'tester', role } });
}

/**
 * ロール選択のトリガを取る。`FormField` は role の Select に `htmlFor` を渡していないため
 * ラベル名では引けない（role 以外の Select も `aria-haspopup="listbox"` を持つ）。フォーム内で
 * 最初に現れる Select がロール選択という順序で特定する。
 */
function getRoleSelectTrigger(): HTMLElement {
  const triggers = screen
    .getAllByRole('button')
    .filter((t) => t.getAttribute('aria-haspopup') === 'listbox');
  return triggers[0];
}

/** ロール選択を開く。 */
async function openRoleSelect() {
  await userEvent.click(getRoleSelectTrigger());
}

/** ロール選択の現在の表示値。 */
function roleSelectText(): string {
  return getRoleSelectTrigger().textContent ?? '';
}

describe('selectableGroupRoles — 呼び出し元ロール別の選択肢（v2-427）', () => {
  it('SYS_ADMIN は全ロールを選べること', () => {
    expect(selectableGroupRoles(UserRole.SYS_ADMIN)).toEqual([
      UserRole.WH_USER,
      UserRole.WH_ADMIN,
      UserRole.OF_USER,
      UserRole.OF_ADMIN,
      UserRole.SYS_ADMIN,
    ]);
  });

  it.each([
    ['WH_ADMIN', UserRole.WH_ADMIN, [UserRole.WH_USER, UserRole.WH_ADMIN]],
    ['OF_ADMIN', UserRole.OF_ADMIN, [UserRole.OF_USER, UserRole.OF_ADMIN]],
  ])('%s の選択肢に SYS_ADMIN が出ないこと', (_label, callerRole, expected) => {
    const roles = selectableGroupRoles(callerRole);

    expect(roles).toEqual(expected);
    expect(roles).not.toContain(UserRole.SYS_ADMIN);
  });

  it.each([
    ['WH_ADMIN', UserRole.WH_ADMIN],
    ['OF_ADMIN', UserRole.OF_ADMIN],
  ])('%s に担当系統外のロールも出ないこと', (_label, callerRole) => {
    const opposite = callerRole === UserRole.WH_ADMIN ? UserRole.OF_ADMIN : UserRole.WH_ADMIN;

    expect(selectableGroupRoles(callerRole)).not.toContain(opposite);
  });

  it('一般ユーザーには選択肢を出さないこと', () => {
    expect(selectableGroupRoles(UserRole.WH_USER)).toEqual([]);
    expect(selectableGroupRoles(UserRole.OF_USER)).toEqual([]);
    expect(selectableGroupRoles(null)).toEqual([]);
  });

  it('編集中の現在値が選択肢に無い時は先頭に残し、表示が壊れないこと', () => {
    // 非 SYS_ADMIN が role=SYS_ADMIN のグループへ到達することは無いが、到達しても現在値は保持する。
    const roles = selectableGroupRoles(UserRole.WH_ADMIN, { currentRole: UserRole.SYS_ADMIN });

    expect(roles[0]).toBe(UserRole.SYS_ADMIN);
    expect(roles).toContain(UserRole.WH_ADMIN);
    expect(roles.filter((r) => r === UserRole.SYS_ADMIN)).toHaveLength(1);
  });

  it('編集中の現在値が選択肢にある時は重複して足さないこと', () => {
    const roles = selectableGroupRoles(UserRole.WH_ADMIN, { currentRole: UserRole.WH_ADMIN });

    expect(roles).toEqual([UserRole.WH_USER, UserRole.WH_ADMIN]);
  });
});

describe('GroupForm - ロール選択の実表示（v2-427）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['WH_ADMIN', UserRole.WH_ADMIN],
    ['OF_ADMIN', UserRole.OF_ADMIN],
  ])('%s の登録フォームで SYS_ADMIN が選択肢に出ないこと', async (_label, role) => {
    loginAs(role);
    render(<GroupForm mode="create" onSubmit={vi.fn()} />);

    await openRoleSelect();

    expect(screen.queryByRole('option', { name: 'システム管理者' })).not.toBeInTheDocument();
  });

  it('SYS_ADMIN の登録フォームでは従来どおり選択肢に出ること', async () => {
    loginAs(UserRole.SYS_ADMIN);
    render(<GroupForm mode="create" onSubmit={vi.fn()} />);

    await openRoleSelect();

    expect(screen.getByRole('option', { name: 'システム管理者' })).toBeInTheDocument();
  });

  it('WH_ADMIN の編集フォームで現在値（WH_ADMIN）が表示されること', () => {
    loginAs(UserRole.WH_ADMIN);
    render(
      <GroupForm
        mode="edit"
        id={1}
        onSubmit={vi.fn()}
        defaultValues={{
          code: 'GRP-WH',
          name: '倉庫チーム',
          role: UserRole.WH_ADMIN,
          status: 'ACTIVE',
        }}
      />,
    );

    expect(roleSelectText()).toContain('倉庫担当（管理者）');
  });

  it('非 SYS_ADMIN が role=SYS_ADMIN のグループを編集しても現在値の表示が壊れないこと', () => {
    loginAs(UserRole.WH_ADMIN);
    render(
      <GroupForm
        mode="edit"
        id={1}
        onSubmit={vi.fn()}
        defaultValues={{
          code: 'GRP-SYS',
          name: 'システム管理',
          role: UserRole.SYS_ADMIN,
          status: 'ACTIVE',
        }}
      />,
    );

    expect(roleSelectText()).toContain('システム管理者');
  });

  it('OF_ADMIN の編集フォームで現在値（OF_USER）が表示されること', () => {
    loginAs(UserRole.OF_ADMIN);
    render(
      <GroupForm
        mode="edit"
        id={2}
        onSubmit={vi.fn()}
        defaultValues={{
          code: 'GRP-OF',
          name: '事務チーム',
          role: UserRole.OF_USER,
          status: 'ACTIVE',
        }}
      />,
    );

    expect(roleSelectText()).toContain('事務担当（一般）');
  });
});
