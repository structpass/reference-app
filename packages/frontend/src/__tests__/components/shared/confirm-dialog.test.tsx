import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: '削除確認',
    description: '本当に削除しますか？',
    onConfirm: vi.fn(),
  };

  it('タイトルと説明を表示すること', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('削除確認')).toBeInTheDocument();
    expect(screen.getByText('本当に削除しますか？')).toBeInTheDocument();
  });

  it('確認ボタンのデフォルトラベルが「確認」であること', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('確認')).toBeInTheDocument();
  });

  it('キャンセルボタンのデフォルトラベルが「キャンセル」であること', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('キャンセル')).toBeInTheDocument();
  });

  it('カスタムラベルを表示すること', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="削除する" cancelLabel="戻る" />);
    expect(screen.getByText('削除する')).toBeInTheDocument();
    expect(screen.getByText('戻る')).toBeInTheDocument();
  });

  it('確認ボタンクリックでonConfirmを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByText('確認'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
