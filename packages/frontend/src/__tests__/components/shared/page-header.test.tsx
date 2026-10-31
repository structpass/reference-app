import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/shared/page-header';

describe('PageHeader', () => {
  it('タイトルを表示すること', () => {
    render(<PageHeader title="商品一覧" />);
    expect(screen.getByText('商品一覧')).toBeInTheDocument();
  });

  it('アクションを表示すること', () => {
    render(<PageHeader title="商品一覧" actions={<button>新規登録</button>} />);
    expect(screen.getByText('新規登録')).toBeInTheDocument();
  });

  it('アクションがない場合はアクション領域を表示しないこと', () => {
    const { container } = render(<PageHeader title="テスト" />);
    const divs = container.querySelectorAll('.flex.items-center.gap-2');
    expect(divs).toHaveLength(0);
  });
});
