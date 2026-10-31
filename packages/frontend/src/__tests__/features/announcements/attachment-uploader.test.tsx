import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentUploader } from '@/features/announcements/components/attachment-uploader';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import toast from 'react-hot-toast';

const config = {
  maxSizeMB: 1,
  maxFiles: 2,
  allowedExtensions: ['pdf', 'png'],
};

function makeFile(name: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)]);
  return new File([blob], name, { type: 'application/octet-stream' });
}

describe('AttachmentUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('config 未取得時は読み込み中メッセージを表示すること', () => {
    render(
      <AttachmentUploader config={null} currentCount={0} onUpload={vi.fn(async () => true)} />,
    );
    expect(screen.getByText('設定情報を読み込み中...')).toBeInTheDocument();
  });

  it('許可されていない拡張子はアップロードされずエラー表示されること', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn(async () => true);
    render(<AttachmentUploader config={config} currentCount={0} onUpload={onUpload} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('malware.exe', 10);
    await user.upload(input, file);
    expect(onUpload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('サイズ上限を超えるファイルはアップロードされないこと', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn(async () => true);
    render(<AttachmentUploader config={config} currentCount={0} onUpload={onUpload} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('big.pdf', 2 * 1024 * 1024);
    await user.upload(input, file);
    expect(onUpload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('制限内のファイルは onUpload が呼ばれること', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn(async () => true);
    render(<AttachmentUploader config={config} currentCount={0} onUpload={onUpload} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('ok.pdf', 100);
    await user.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it('上限に達している場合ボタンが無効化されること', () => {
    render(
      <AttachmentUploader config={config} currentCount={2} onUpload={vi.fn(async () => true)} />,
    );
    const button = screen.getByRole('button', { name: '＋追加' });
    expect(button).toBeDisabled();
  });
});
