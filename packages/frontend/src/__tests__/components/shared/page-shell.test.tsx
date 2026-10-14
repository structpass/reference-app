import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageShell } from '@/components/shared/page-shell';

describe('PageShell', () => {
  it('タイトルを表示すること', () => {
    render(
      <PageShell title="商品一覧">
        <p>本文</p>
      </PageShell>,
    );
    expect(screen.getByText('商品一覧')).toBeInTheDocument();
  });

  it('children を表示すること', () => {
    render(
      <PageShell title="商品一覧">
        <p>本文コンテンツ</p>
      </PageShell>,
    );
    expect(screen.getByText('本文コンテンツ')).toBeInTheDocument();
  });

  it('actions を PageHeader に渡すこと', () => {
    render(
      <PageShell title="商品一覧" actions={<button>新規</button>}>
        <p>本文</p>
      </PageShell>,
    );
    expect(screen.getByRole('button', { name: '新規' })).toBeInTheDocument();
  });

  it('sp-page クラスでラップすること', () => {
    const { container } = render(
      <PageShell title="商品一覧">
        <p>本文</p>
      </PageShell>,
    );
    expect(container.querySelector('.sp-page')).not.toBeNull();
  });
});
