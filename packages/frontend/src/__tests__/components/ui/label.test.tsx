import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from '@/components/ui/label';

describe('Label', () => {
  it('ラベルテキストを描画すること', () => {
    render(<Label>ユーザー名</Label>);
    expect(screen.getByText('ユーザー名')).toBeInTheDocument();
  });

  it('htmlFor属性を設定すること', () => {
    render(<Label htmlFor="username">ユーザー名</Label>);
    expect(screen.getByText('ユーザー名')).toHaveAttribute('for', 'username');
  });

  it('カスタムクラスを適用すること', () => {
    render(<Label className="custom-label">テスト</Label>);
    expect(screen.getByText('テスト').className).toContain('custom-label');
  });
});
