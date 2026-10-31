import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@/components/ui/table';

describe('Table', () => {
  it('テーブル全体を描画すること', () => {
    render(
      <Table>
        <TableCaption>テストテーブル</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>ステータス</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>商品A</TableCell>
            <TableCell>有効</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>合計</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(screen.getByText('テストテーブル')).toBeInTheDocument();
    expect(screen.getByText('名前')).toBeInTheDocument();
    expect(screen.getByText('ステータス')).toBeInTheDocument();
    expect(screen.getByText('商品A')).toBeInTheDocument();
    expect(screen.getByText('有効')).toBeInTheDocument();
    expect(screen.getByText('合計')).toBeInTheDocument();
  });

  it('各コンポーネントにカスタムクラスを適用すること', () => {
    render(
      <Table>
        <TableHeader data-testid="header" className="custom-header">
          <TableRow data-testid="row" className="custom-row">
            <TableHead data-testid="head" className="custom-head">
              ヘッダー
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid="body" className="custom-body">
          <TableRow>
            <TableCell data-testid="cell" className="custom-cell">
              セル
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId('header').className).toContain('custom-header');
    expect(screen.getByTestId('row').className).toContain('custom-row');
    expect(screen.getByTestId('head').className).toContain('custom-head');
    expect(screen.getByTestId('body').className).toContain('custom-body');
    expect(screen.getByTestId('cell').className).toContain('custom-cell');
  });
});
