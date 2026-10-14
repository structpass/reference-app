import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveStatus, UserRole } from '@struct-pass/shared';
import { UserForm } from '@/features/users/components/user-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const buildDefaults = (status: ActiveStatus) => ({
  name: 'testuser',
  email: 'test@example.com',
  role: UserRole.WH_USER,
  status,
});

describe('UserForm - submit 動作', () => {
  it('フォーム送信時にisActiveがtrueでonSubmitを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <UserForm
        mode="create"
        onSubmit={onSubmit}
        defaultValues={buildDefaults(ActiveStatus.ACTIVE)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'testuser',
          email: 'test@example.com',
          role: 'WH_USER',
          isActive: true,
          status: 'ACTIVE',
        }),
      );
    });
  });

  it('role 未選択（権限待ち）のとき role=null で onSubmit を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <UserForm
        mode="create"
        onSubmit={onSubmit}
        defaultValues={{
          name: 'pending',
          email: 'pending@example.com',
          status: ActiveStatus.ACTIVE,
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'pending',
          role: null,
        }),
      );
    });
  });

  it('ステータスがINACTIVEのときisActiveがfalseでonSubmitを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <UserForm
        mode="create"
        onSubmit={onSubmit}
        defaultValues={buildDefaults(ActiveStatus.INACTIVE)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          status: 'INACTIVE',
        }),
      );
    });
  });

  it('Select 群を開くと option が表示されること', async () => {
    const user = userEvent.setup();
    render(
      <UserForm
        mode="create"
        onSubmit={vi.fn()}
        defaultValues={buildDefaults(ActiveStatus.ACTIVE)}
      />,
    );

    const triggers = screen.getAllByRole('button');
    const selectTriggers = triggers.filter((t) => t.getAttribute('aria-haspopup') === 'listbox');
    expect(selectTriggers.length).toBeGreaterThan(0);
    if (selectTriggers.length > 1) {
      await user.click(selectTriggers[1]);
      expect(screen.getByText('無効')).toBeInTheDocument();
    }
  });
});
