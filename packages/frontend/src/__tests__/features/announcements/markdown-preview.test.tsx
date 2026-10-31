import { render, screen } from '@testing-library/react';
import { MarkdownPreview } from '@/features/announcements/components/markdown-preview';

describe('MarkdownPreview (XSS 耐性)', () => {
  it('<script> タグは除去されること', () => {
    const { container } = render(
      <MarkdownPreview source={'# Hello\n\n<script>alert(1)</script>\n'} />,
    );
    expect(container.querySelector('script')).toBeNull();
  });

  it('onclick 属性などイベントハンドラは除去されること', () => {
    const { container } = render(
      <MarkdownPreview source={'<a href="https://example.com" onclick="evil()">click</a>'} />,
    );
    const link = container.querySelector('a');
    if (link) {
      expect(link.getAttribute('onclick')).toBeNull();
    }
  });

  it('javascript: スキームの URL は除去されること', () => {
    const { container } = render(<MarkdownPreview source={'[click](javascript:alert(1))'} />);
    const link = container.querySelector('a');
    if (link) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('javascript:')).toBe(false);
    }
  });

  it('通常の Markdown は HTML にレンダリングされること', () => {
    render(<MarkdownPreview source={'# 見出し\n\n- 項目1'} />);
    expect(screen.getByText('見出し')).toBeInTheDocument();
    expect(screen.getByText('項目1')).toBeInTheDocument();
  });

  it('テーブル記法 (GFM) がレンダリングされること', () => {
    const source = '| A | B |\n|---|---|\n| 1 | 2 |';
    const { container } = render(<MarkdownPreview source={source} />);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('http/https リンクは target=_blank を持つこと', () => {
    const { container } = render(<MarkdownPreview source={'[go](https://example.com)'} />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });
});
