import { effectiveQty } from './effective-quantity.helper';

describe('effectiveQty', () => {
  describe('実績数がある場合', () => {
    it('正の実績数をそのまま使うこと', () => {
      expect(effectiveQty({ actualQty: 7, plannedQty: 10 })).toBe(7);
    });

    it('明示 0 は 0 のまま保持し、予定数へ読み替えないこと', () => {
      // `||` や truthy 判定に置き換えると 0 が plannedQty へ化ける（実装の退行検出）
      expect(effectiveQty({ actualQty: 0, plannedQty: 10 })).toBe(0);
    });

    it('予定数より大きい実績数もそのまま使うこと', () => {
      expect(effectiveQty({ actualQty: 12, plannedQty: 10 })).toBe(12);
    });
  });

  describe('実績数が未入力の場合', () => {
    it('null は予定数へ落とすこと', () => {
      expect(effectiveQty({ actualQty: null, plannedQty: 5 })).toBe(5);
    });

    it('undefined は予定数へ落とすこと', () => {
      expect(effectiveQty({ actualQty: undefined as unknown as null, plannedQty: 5 })).toBe(5);
    });
  });

  describe('確定と取消の対称性', () => {
    it('同じ明細では常に同じ数量を返すこと（呼び出し側で符号だけを変える）', () => {
      const lines = [
        { actualQty: null, plannedQty: 5 },
        { actualQty: 0, plannedQty: 5 },
        { actualQty: 3, plannedQty: 5 },
      ];
      expect(lines.map(effectiveQty)).toEqual([5, 0, 3]);
    });
  });
});
