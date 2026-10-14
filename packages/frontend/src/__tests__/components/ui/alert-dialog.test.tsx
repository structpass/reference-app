import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

describe('AlertDialog', () => {
  it('open=falseの時にコンテンツを非表示にすること', () => {
    render(
      <AlertDialog open={false}>
        <AlertDialogContent>
          <AlertDialogTitle>確認</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.queryByText('確認')).not.toBeInTheDocument();
  });

  it('open=trueの時にコンテンツを表示すること', () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>削除確認</AlertDialogTitle>
            <AlertDialogDescription>本当に削除しますか？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByText('削除確認')).toBeInTheDocument();
    expect(screen.getByText('本当に削除しますか？')).toBeInTheDocument();
    expect(screen.getByText('キャンセル')).toBeInTheDocument();
    expect(screen.getByText('削除')).toBeInTheDocument();
  });

  it('トリガーボタンクリックでonOpenChangeを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AlertDialog open={false} onOpenChange={onOpenChange}>
        <AlertDialogTrigger>開く</AlertDialogTrigger>
      </AlertDialog>,
    );
    await user.click(screen.getByText('開く'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('キャンセルボタンでonOpenChange(false)を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AlertDialog open={true} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    await user.click(screen.getByText('キャンセル'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Escapeキーでダイアログを閉じること', () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog open={true} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>テスト</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: document に対する keyDown native event。userEvent.keyboard はフォーカス要素に dispatch するため document level の listener 検証には不適
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('alertdialogロールが設定されること', () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogContent>
          <AlertDialogTitle>テスト</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
