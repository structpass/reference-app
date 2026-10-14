import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ToastProvider } from '@/components/providers/toast-provider';

vi.mock('react-hot-toast', () => ({
  Toaster: ({ position }: { position: string }) => (
    <div data-testid="toaster" data-position={position} />
  ),
}));

describe('ToastProvider', () => {
  it('Toasterコンポーネントを描画すること', () => {
    const { getByTestId } = render(<ToastProvider />);
    expect(getByTestId('toaster')).toBeInTheDocument();
  });

  it('top-rightポジションで設定されること', () => {
    const { getByTestId } = render(<ToastProvider />);
    expect(getByTestId('toaster').getAttribute('data-position')).toBe('top-right');
  });
});
