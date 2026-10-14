import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '@/components/shared/pagination';

describe('Pagination', () => {
  const defaultMeta = { total: 50, page: 2, limit: 20, totalPages: 3 };

  it('現在/全ページと全件数を表示すること', () => {
    render(<Pagination meta={defaultMeta} onPageChange={vi.fn()} />);
    expect(screen.getByText('2 / 3 page')).toBeInTheDocument();
    expect(screen.getByText('全 50 件')).toBeInTheDocument();
  });

  it('前のページボタンで page-1 を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination meta={defaultMeta} onPageChange={onChange} />);
    await user.click(screen.getByLabelText('前のページ'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('次のページボタンで page+1 を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination meta={defaultMeta} onPageChange={onChange} />);
    await user.click(screen.getByLabelText('次のページ'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('先頭ページボタンで 1 を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination meta={defaultMeta} onPageChange={onChange} />);
    await user.click(screen.getByLabelText('先頭ページ'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('最終ページボタンで totalPages を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination meta={defaultMeta} onPageChange={onChange} />);
    await user.click(screen.getByLabelText('最終ページ'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('最初のページで先頭/前のページボタンが無効になること', () => {
    render(<Pagination meta={{ ...defaultMeta, page: 1 }} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText('先頭ページ')).toBeDisabled();
    expect(screen.getByLabelText('前のページ')).toBeDisabled();
  });

  it('最後のページで次/最終ページボタンが無効になること', () => {
    render(<Pagination meta={{ ...defaultMeta, page: 3 }} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText('次のページ')).toBeDisabled();
    expect(screen.getByLabelText('最終ページ')).toBeDisabled();
  });

  it('totalPages<=1 の場合にナビボタンを非表示にすること', () => {
    render(
      <Pagination meta={{ total: 5, page: 1, limit: 20, totalPages: 1 }} onPageChange={vi.fn()} />,
    );
    expect(screen.queryByLabelText('前のページ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('次のページ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('先頭ページ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('最終ページ')).not.toBeInTheDocument();
  });
});
