import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>テスト</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('テスト');
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>クリック</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when loading', () => {
    render(<Button loading>送信</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows spinner when loading', () => {
    render(<Button loading>送信</Button>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>送信</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('sp-action variant で sp-accent-soft hover クラスが付くこと', () => {
    render(<Button variant="sp-action">アクション</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/hover:bg-\[var\(--sp-accent-soft\)\]/);
    expect(btn.className).toMatch(/hover:text-\[var\(--sp-accent-ink\)\]/);
  });
});
