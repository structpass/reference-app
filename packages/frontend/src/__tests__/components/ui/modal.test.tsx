import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/ui/modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="テスト">
        内容
      </Modal>,
    );
    expect(screen.queryByText('テスト')).not.toBeInTheDocument();
  });

  it('renders title and children when open', () => {
    render(
      <Modal open onClose={vi.fn()} title="削除確認">
        本当に削除しますか？
      </Modal>,
    );
    expect(screen.getByText('削除確認')).toBeInTheDocument();
    expect(screen.getByText('本当に削除しますか？')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="テスト" onConfirm={vi.fn()}>
        内容
      </Modal>,
    );
    await user.click(screen.getByText('キャンセル'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('EscapeキーでonCloseを呼ぶこと', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="テスト">
        内容
      </Modal>,
    );
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: document に対する keyDown native event。userEvent.keyboard はフォーカス要素に dispatch するため document level の listener 検証には不適
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <Modal open onClose={vi.fn()} title="テスト" onConfirm={onConfirm} confirmLabel="削除">
        内容
      </Modal>,
    );
    await user.click(screen.getByText('削除'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
