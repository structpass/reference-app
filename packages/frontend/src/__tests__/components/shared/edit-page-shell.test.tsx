import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';

describe('EditPageShell', () => {
  it('タイトルを表示すること', () => {
    render(
      <EditPageShell title="商品編集" actions={<button>更新</button>}>
        <p>フォーム</p>
      </EditPageShell>,
    );
    expect(screen.getByText('商品編集')).toBeInTheDocument();
  });

  it('actions と children を両方表示すること', () => {
    render(
      <EditPageShell title="商品編集" actions={<button>更新</button>}>
        <p>フォーム本体</p>
      </EditPageShell>,
    );
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument();
    expect(screen.getByText('フォーム本体')).toBeInTheDocument();
  });

  it('sp-paper 背景の flex column 構造でラップすること', () => {
    const { container } = render(
      <EditPageShell title="商品編集" actions={<button>更新</button>}>
        <p>フォーム</p>
      </EditPageShell>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/flex/);
    expect(root.className).toMatch(/flex-col/);
    expect(root.className).toMatch(/bg-\[var\(--sp-paper\)\]/);
  });

  it('actions 行に sp-line-warm の border-b を持つこと', () => {
    const { container } = render(
      <EditPageShell title="商品編集" actions={<button>更新</button>}>
        <p>フォーム</p>
      </EditPageShell>,
    );
    const borderRow = container.querySelector('.border-\\[var\\(--sp-line-warm\\)\\]');
    expect(borderRow).not.toBeNull();
  });
});

describe('EditPageLoader', () => {
  it('Spinner を中央配置でレンダリングすること', () => {
    const { container } = render(<EditPageLoader />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/justify-center/);
    expect(root.querySelector('svg')).not.toBeNull();
  });
});

describe('EditPageNotFound', () => {
  it('受け取った message を表示すること', () => {
    render(<EditPageNotFound message="商品が見つかりませんでした" />);
    expect(screen.getByText('商品が見つかりませんでした')).toBeInTheDocument();
  });

  it('warm-mute 色で中央配置されること', () => {
    const { container } = render(<EditPageNotFound message="x" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/text-center/);
    expect(root.className).toMatch(/text-\[var\(--sp-text-warm-mute\)\]/);
  });
});
