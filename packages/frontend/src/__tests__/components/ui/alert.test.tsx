import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

describe('Alert', () => {
  it('デフォルトのアラートを描画すること', () => {
    render(<Alert>テストアラート</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('テストアラート')).toBeInTheDocument();
  });

  it('destructiveバリアントを適用すること', () => {
    render(<Alert variant="destructive">エラー</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('destructive');
  });

  it('カスタムクラスを適用すること', () => {
    render(<Alert className="custom-class">テスト</Alert>);
    expect(screen.getByRole('alert').className).toContain('custom-class');
  });
});

describe('AlertTitle', () => {
  it('タイトルを描画すること', () => {
    render(<AlertTitle>警告タイトル</AlertTitle>);
    expect(screen.getByText('警告タイトル')).toBeInTheDocument();
  });
});

describe('AlertDescription', () => {
  it('説明文を描画すること', () => {
    render(<AlertDescription>詳細説明</AlertDescription>);
    expect(screen.getByText('詳細説明')).toBeInTheDocument();
  });
});
