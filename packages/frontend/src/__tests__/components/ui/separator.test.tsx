import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from '@/components/ui/separator';

describe('Separator', () => {
  it('デフォルトで水平セパレーターを描画すること', () => {
    render(<Separator data-testid="sep" />);
    const sep = screen.getByTestId('sep');
    expect(sep).toBeInTheDocument();
    expect(sep.getAttribute('role')).toBe('none');
    expect(sep.className).toContain('w-full');
  });

  it('垂直セパレーターを描画すること', () => {
    render(<Separator data-testid="sep" orientation="vertical" />);
    const sep = screen.getByTestId('sep');
    expect(sep.className).toContain('w-[1px]');
  });

  it('decorativeがfalseの場合にseparatorロールを設定すること', () => {
    render(<Separator data-testid="sep" decorative={false} orientation="horizontal" />);
    const sep = screen.getByTestId('sep');
    expect(sep.getAttribute('role')).toBe('separator');
    expect(sep.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('カスタムクラスを適用すること', () => {
    render(<Separator data-testid="sep" className="my-sep" />);
    expect(screen.getByTestId('sep').className).toContain('my-sep');
  });
});
