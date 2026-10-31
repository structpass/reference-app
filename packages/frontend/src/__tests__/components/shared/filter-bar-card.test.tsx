import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterBarCard } from '@/components/shared/filter-bar-card';
import type { FilterField } from '@/components/shared/filter-bar';

describe('FilterBarCard', () => {
  const searchField: FilterField = {
    key: 'search',
    label: '商品',
    type: 'search',
    placeholder: 'コードで検索...',
  };

  it('FilterBar を内包し検索フィールドを表示すること', () => {
    render(<FilterBarCard fields={[searchField]} onFilterChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('コードで検索...')).toBeInTheDocument();
  });

  it('actions を表示すること', () => {
    render(
      <FilterBarCard
        fields={[searchField]}
        onFilterChange={vi.fn()}
        actions={<button>新規登録</button>}
      />,
    );
    expect(screen.getByRole('button', { name: '新規登録' })).toBeInTheDocument();
  });

  it('sp-line-warm 枠で囲まれていること', () => {
    const { container } = render(<FilterBarCard fields={[searchField]} onFilterChange={vi.fn()} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/border-\[var\(--sp-line-warm\)\]/);
  });
});
