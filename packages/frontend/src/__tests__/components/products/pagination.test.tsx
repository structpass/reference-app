import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '@/components/shared/pagination';

describe('Pagination', () => {
  it('現在/全ページを表示する', () => {
    render(
      <Pagination
        meta={{ page: 2, totalPages: 5, total: 100, limit: 20 }}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByText('2 / 5 page')).toBeInTheDocument();
  });

  it('最初のページで前ボタン群が disabled', () => {
    render(
      <Pagination
        meta={{ page: 1, totalPages: 5, total: 100, limit: 20 }}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('前のページ')).toBeDisabled();
    expect(screen.getByLabelText('先頭ページ')).toBeDisabled();
  });

  it('最後のページで次ボタン群が disabled', () => {
    render(
      <Pagination
        meta={{ page: 5, totalPages: 5, total: 100, limit: 20 }}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('次のページ')).toBeDisabled();
    expect(screen.getByLabelText('最終ページ')).toBeDisabled();
  });

  it('onPageChange が正しい値で呼ばれる', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        meta={{ page: 2, totalPages: 5, total: 100, limit: 20 }}
        onPageChange={onPageChange}
      />,
    );
    await user.click(screen.getByLabelText('前のページ'));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByLabelText('次のページ'));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByLabelText('先頭ページ'));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByLabelText('最終ページ'));
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it('1 ページのみのときナビボタンを表示しない', () => {
    render(
      <Pagination meta={{ page: 1, totalPages: 1, total: 5, limit: 20 }} onPageChange={vi.fn()} />,
    );
    expect(screen.queryByLabelText('前のページ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('次のページ')).not.toBeInTheDocument();
  });
});
