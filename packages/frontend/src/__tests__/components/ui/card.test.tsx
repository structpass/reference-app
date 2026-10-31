import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

describe('Card', () => {
  it('カード全体を描画すること', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>カードタイトル</CardTitle>
          <CardDescription>カード説明</CardDescription>
        </CardHeader>
        <CardContent>コンテンツ</CardContent>
        <CardFooter>フッター</CardFooter>
      </Card>,
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('カードタイトル')).toBeInTheDocument();
    expect(screen.getByText('カード説明')).toBeInTheDocument();
    expect(screen.getByText('コンテンツ')).toBeInTheDocument();
    expect(screen.getByText('フッター')).toBeInTheDocument();
  });

  it('カスタムクラスを適用すること', () => {
    render(
      <Card data-testid="card" className="custom-class">
        テスト
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('custom-class');
  });

  it('CardHeaderにカスタムクラスを適用すること', () => {
    render(
      <CardHeader data-testid="header" className="header-class">
        ヘッダー
      </CardHeader>,
    );
    expect(screen.getByTestId('header').className).toContain('header-class');
  });

  it('CardContentにカスタムクラスを適用すること', () => {
    render(
      <CardContent data-testid="content" className="content-class">
        内容
      </CardContent>,
    );
    expect(screen.getByTestId('content').className).toContain('content-class');
  });

  it('CardFooterにカスタムクラスを適用すること', () => {
    render(
      <CardFooter data-testid="footer" className="footer-class">
        フッター
      </CardFooter>,
    );
    expect(screen.getByTestId('footer').className).toContain('footer-class');
  });
});
