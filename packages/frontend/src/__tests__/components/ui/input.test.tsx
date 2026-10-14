import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('テキスト入力を描画すること', () => {
    render(<Input placeholder="入力してください" />);
    expect(screen.getByPlaceholderText('入力してください')).toBeInTheDocument();
  });

  it('type属性を受け付けること', () => {
    render(<Input type="password" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password');
  });

  it('disabledを設定できること', () => {
    render(<Input disabled data-testid="input" />);
    expect(screen.getByTestId('input')).toBeDisabled();
  });

  it('値の変更を受け付けること', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} data-testid="input" />);
    await user.type(screen.getByTestId('input'), 'テスト');
    expect(handleChange).toHaveBeenCalled();
  });

  it('カスタムクラスを適用すること', () => {
    render(<Input className="custom-input" data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('custom-input');
  });
});
