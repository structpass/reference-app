import { render, screen } from '@testing-library/react';
import { FormField } from '@/components/ui/form-field';

describe('FormField', () => {
  it('ラベルを表示すること', () => {
    render(
      <FormField label="テスト">
        <input />
      </FormField>,
    );
    expect(screen.getByText('テスト')).toBeInTheDocument();
  });

  it('requiredの場合に必須マークを表示すること', () => {
    const { container } = render(
      <FormField label="名前" required>
        <input />
      </FormField>,
    );
    // `*` と「必須」は別 span に分割されているため textContent で結合判定
    expect(container.textContent).toContain('*必須');
  });

  it('requiredがfalseの場合に必須マークを表示しないこと', () => {
    const { container } = render(
      <FormField label="名前">
        <input />
      </FormField>,
    );
    expect(container.textContent).not.toContain('必須');
  });

  it('エラーメッセージを表示すること', () => {
    render(
      <FormField label="名前" error="入力してください">
        <input />
      </FormField>,
    );
    expect(screen.getByText('入力してください')).toBeInTheDocument();
  });

  it('エラーがない場合にエラーメッセージを表示しないこと', () => {
    render(
      <FormField label="名前">
        <input />
      </FormField>,
    );
    expect(screen.queryByText(/入力/)).not.toBeInTheDocument();
  });

  it('子要素をレンダリングすること', () => {
    render(
      <FormField>
        <input data-testid="child" />
      </FormField>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
