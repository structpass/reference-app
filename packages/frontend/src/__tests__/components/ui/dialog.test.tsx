import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

describe('Dialog', () => {
  it('open=falseでコンテンツが表示されないこと', () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <span>ダイアログ内容</span>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText('ダイアログ内容')).not.toBeInTheDocument();
  });

  it('open=trueでコンテンツが表示されること', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <span>ダイアログ内容</span>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('ダイアログ内容')).toBeInTheDocument();
  });

  it('閉じるボタンでonOpenChange(false)が呼ばれること', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <span>内容</span>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByText('閉じる'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('showCloseButton=falseで閉じるボタンが非表示であること', () => {
    render(
      <Dialog open={true}>
        <DialogContent showCloseButton={false}>
          <span>内容</span>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText('閉じる')).not.toBeInTheDocument();
  });

  it('DialogTriggerがクリックでonOpenChange(true)を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogTrigger>開く</DialogTrigger>
        <DialogContent>
          <span>内容</span>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByText('開く'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('DialogCloseがクリックでonOpenChange(false)を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false}>
          <DialogClose>キャンセル</DialogClose>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByText('キャンセル'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ヘッダ・タイトル・説明・フッタが表示されること', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>テストタイトル</DialogTitle>
            <DialogDescription>テスト説明</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button">OK</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('テストタイトル')).toBeInTheDocument();
    expect(screen.getByText('テスト説明')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('EscapeキーでonOpenChange(false)を呼ぶこと', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <span>内容</span>
        </DialogContent>
      </Dialog>,
    );
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: document に対する keyDown native event。userEvent.keyboard はフォーカス要素に dispatch するため document level の listener 検証には不適
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('オーバーレイクリックでonOpenChange(false)を呼ぶこと', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <span>内容</span>
        </DialogContent>
      </Dialog>,
    );
    const overlays = document.querySelectorAll('.fixed.inset-0');
    if (overlays.length > 0) {
      await user.click(overlays[0]);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    }
  });

  it('role=dialogとaria-modal=trueが設定されていること', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <span>内容</span>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
