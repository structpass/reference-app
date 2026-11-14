import { STATUS_LABELS, statusLabel } from './status-label';

/**
 * 一覧の書き出しの状態表記（d1019）。画面の表記（frontend の STATUS_LABELS）と同じ言葉であることを固定する。
 */
describe('statusLabel', () => {
  it('画面と同じ言葉で状態を出す（出荷は 出荷済・発注は 発注済）', () => {
    expect(statusLabel('ACTIVE')).toBe('有効');
    expect(statusLabel('INACTIVE')).toBe('無効');
    expect(statusLabel('SHIPPED')).toBe('出荷済');
    expect(statusLabel('ORDERED')).toBe('発注済');
    expect(statusLabel('DRAFT')).toBe('下書き');
    expect(statusLabel('CONFIRMED')).toBe('確定');
  });

  it('知らない値はそのまま返す（消さない・別の言葉にしない）', () => {
    expect(statusLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(statusLabel('')).toBe('');
  });

  it('画面の表記の正本と、書き出しの表記の共通の状態が同じ言葉を指す', () => {
    // frontend/src/lib/constants.ts の STATUS_LABELS と重なる 9 の状態が同じ言葉であること。
    // 画面側の値をここへ写すのは、書き出しと画面の食い違い（出荷済 / 出荷完了）を試験で捕まえるため。
    const screen = {
      ACTIVE: '有効',
      INACTIVE: '無効',
      DISCONTINUED: '廃止',
      DRAFT: '下書き',
      CONFIRMED: '確定',
      COMPLETED: '完了',
      SHIPPED: '出荷済',
      ORDERED: '発注済',
      PARTIALLY_RECEIVED: '一部入荷',
    } as const;
    for (const [key, label] of Object.entries(screen)) {
      expect(STATUS_LABELS[key]).toBe(label);
    }
  });
});
