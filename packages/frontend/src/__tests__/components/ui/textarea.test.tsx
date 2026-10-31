import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '@/components/ui/textarea';

describe('Textarea', () => {
  it('テキストエリアを描画すること', () => {
    render(<Textarea placeholder="説明を入力" />);
    expect(screen.getByPlaceholderText('説明を入力')).toBeInTheDocument();
  });

  it('disabledを設定できること', () => {
    render(<Textarea disabled data-testid="textarea" />);
    expect(screen.getByTestId('textarea')).toBeDisabled();
  });

  it('値の変更を受け付けること', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Textarea onChange={handleChange} data-testid="textarea" />);
    await user.type(screen.getByTestId('textarea'), 'テスト値');
    expect(handleChange).toHaveBeenCalled();
  });

  it('カスタムクラスを適用すること', () => {
    render(<Textarea className="custom-textarea" data-testid="textarea" />);
    expect(screen.getByTestId('textarea').className).toContain('custom-textarea');
  });
});
