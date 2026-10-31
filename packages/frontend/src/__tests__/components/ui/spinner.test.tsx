import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '@/components/ui/spinner';

describe('Spinner', () => {
  it('スピナーを描画すること', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('aria-labelが設定されていること', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('読み込み中')).toBeInTheDocument();
  });

  it('カスタムクラスを適用すること', () => {
    render(<Spinner className="h-8 w-8" />);
    const spinner = screen.getByRole('status');
    expect(spinner.getAttribute('class')).toContain('h-8');
    expect(spinner.getAttribute('class')).toContain('w-8');
  });
});
