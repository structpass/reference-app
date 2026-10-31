import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductTable } from '@/features/products/components/product-table';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockProducts = [
  {
    id: '1',
    code: 'P-001',
    name: '商品A',
    category: 'カテゴリA',
    price: 1000,
    stockQuantity: 50,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('ProductTable - インタラクション', () => {
  it('商品コードクリックで参照ページに遷移すること', async () => {
    const user = userEvent.setup();
    render(
      <ProductTable
        products={mockProducts as never}
        sortConfig={{ sort: 'createdAt', order: 'desc' }}
        onSort={vi.fn()}
      />,
    );

    await user.click(screen.getByText('P-001'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/products/1');
  });

  it('削除ボタンクリックでonDeleteを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ProductTable
        products={mockProducts as never}
        sortConfig={{ sort: 'createdAt', order: 'desc' }}
        onSort={vi.fn()}
        onDelete={onDelete}
        showDelete
      />,
    );

    await user.click(screen.getByLabelText('削除'));
    expect(onDelete).toHaveBeenCalledWith(mockProducts[0]);
  });

  it('ソート中のカラムにascアイコンを表示すること', () => {
    render(
      <ProductTable
        products={mockProducts as never}
        sortConfig={{ sort: 'code', order: 'asc' }}
        onSort={vi.fn()}
      />,
    );

    expect(screen.getByText('商品コード')).toBeInTheDocument();
  });

  it('ソート中のカラムにdescアイコンを表示すること', () => {
    render(
      <ProductTable
        products={mockProducts as never}
        sortConfig={{ sort: 'code', order: 'desc' }}
        onSort={vi.fn()}
      />,
    );

    expect(screen.getByText('商品コード')).toBeInTheDocument();
  });

  it('空の商品リストでメッセージを表示すること', () => {
    render(
      <ProductTable
        products={[]}
        sortConfig={{ sort: 'createdAt', order: 'desc' }}
        onSort={vi.fn()}
      />,
    );

    expect(screen.getByText('商品が見つかりませんでした')).toBeInTheDocument();
  });

  it('showDelete=falseで削除ボタンを非表示にすること', () => {
    render(
      <ProductTable
        products={mockProducts as never}
        sortConfig={{ sort: 'createdAt', order: 'desc' }}
        onSort={vi.fn()}
        showDelete={false}
      />,
    );

    expect(screen.queryByLabelText('削除')).not.toBeInTheDocument();
  });
});
