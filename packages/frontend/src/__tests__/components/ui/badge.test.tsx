import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('childrenをレンダリングすること', () => {
    render(<Badge>有効</Badge>);
    expect(screen.getByText('有効')).toBeInTheDocument();
  });

  it('variant="destructive"でレンダリングすること', () => {
    const { container } = render(<Badge variant="destructive">廃止</Badge>);
    expect(screen.getByText('廃止')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-destructive');
  });

  it('variant="outline"でレンダリングすること', () => {
    const { container } = render(<Badge variant="outline">下書き</Badge>);
    expect(screen.getByText('下書き')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-[var(--sp-text-warm)]');
  });
});
