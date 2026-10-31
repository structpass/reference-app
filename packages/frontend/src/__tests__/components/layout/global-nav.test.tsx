import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobalNav } from '@/components/layout/global-nav';

const RETE_URL = process.env.NEXT_PUBLIC_RETE_URL ?? 'http://localhost:3010';

describe('GlobalNav', () => {
  it('rete と同順・英語ラベルのタブ（Home/Desk/File/System/Mock/Setting/Model/Backlog・ref-0020）を表示すること', () => {
    render(<GlobalNav />);
    const nav = screen.getByRole('navigation', { name: 'グローバルメニュー' });
    // ref-0026: ラベル内に太字幅予約ゴースト（aria-hidden の複製テキスト）が入ったため、
    // textContent 連結ではなくラベル先頭のテキストノードで順序を検証する。
    const labels = [...nav.querySelectorAll('.tab-link-label')].map(
      (el) => el.firstChild?.textContent,
    );
    expect(labels).toEqual([
      'Home',
      'Desk',
      'File',
      'System',
      'Mock',
      'Setting',
      'Model',
      'Backlog',
    ]);
  });

  it('System タブがアクティブ表示（aria-current=page）でリンクを持たないこと', () => {
    render(<GlobalNav />);
    // ref-0026: ゴースト複製で getByText が多重ヒットするため aria-current で特定する。
    const nav = screen.getByRole('navigation', { name: 'グローバルメニュー' });
    const system = nav.querySelector<HTMLElement>('[aria-current="page"]');
    expect(system).not.toBeNull();
    expect(system).toHaveClass('tab-link');
    expect(system).toHaveTextContent('System');
    expect(system!.tagName).not.toBe('A');
  });

  it('Home/Desk/File/Setting/Model/Backlog が Rete のベース URL 配下へのリンクであること', () => {
    render(<GlobalNav />);
    const expected: Record<string, string> = {
      Home: '/hub',
      Desk: '/desk',
      File: '/files',
      Setting: '/settings',
      Model: '/model',
      Backlog: '/backlog',
    };
    // accessible name（aria-hidden のゴーストは含まれない）で特定する（ref-0026）。
    for (const [label, path] of Object.entries(expected)) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        `${RETE_URL}${path}`,
      );
    }
  });

  it('Model タブが追加され Rete の /model へのリンクであること', () => {
    render(<GlobalNav />);
    expect(screen.getByRole('link', { name: 'Model' })).toHaveAttribute(
      'href',
      `${RETE_URL}/model`,
    );
  });

  it('Mock タブは準備中（disabled ボタン）でリンクを持たないこと', () => {
    render(<GlobalNav />);
    // ref-0026: ゴースト複製で getByText が多重ヒットするため role + accessible name で特定する。
    const mock = screen.getByRole('button', { name: 'Mock' });
    expect(mock).toBeDisabled();
    expect(mock.tagName).not.toBe('A');
  });
});
