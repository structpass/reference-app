import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrudCell } from '@/features/permissions/components/crud-cell';

describe('CrudCell', () => {
  const defaultProps = {
    canView: true,
    canCreate: false,
    canUpdate: true,
    canDelete: false,
    crudSupport: { view: true, create: true, update: true, delete: true },
    onToggle: vi.fn(),
  };

  it('全CRUDアクションのアイコンを表示すること', () => {
    render(<CrudCell {...defaultProps} />);
    expect(screen.getByTitle('参照 ON')).toBeInTheDocument();
    expect(screen.getByTitle('登録 OFF')).toBeInTheDocument();
    expect(screen.getByTitle('修正 ON')).toBeInTheDocument();
    expect(screen.getByTitle('削除 OFF')).toBeInTheDocument();
  });

  it('crudSupportでサポートされないアクションを非表示にすること', () => {
    render(
      <CrudCell
        {...defaultProps}
        crudSupport={{ view: true, create: false, update: false, delete: false }}
      />,
    );
    expect(screen.getByTitle('参照 ON')).toBeInTheDocument();
    expect(screen.queryByTitle('登録 OFF')).not.toBeInTheDocument();
    expect(screen.queryByTitle('修正 ON')).not.toBeInTheDocument();
    expect(screen.queryByTitle('削除 OFF')).not.toBeInTheDocument();
  });

  it('クリックでonToggleを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<CrudCell {...defaultProps} onToggle={onToggle} />);
    await user.click(screen.getByTitle('参照 ON'));
    expect(onToggle).toHaveBeenCalledWith('canView');
  });

  it('readOnlyの場合にボタンが無効化されること', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<CrudCell {...defaultProps} readOnly onToggle={onToggle} />);
    const btn = screen.getByTitle('参照 ON');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
