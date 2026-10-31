import { notDeleted } from './soft-delete.helper';

describe('soft-delete.helper', () => {
  describe('notDeleted', () => {
    it('deletedAt: null の where 断片であること（未削除レコードのみを対象化）', () => {
      expect(notDeleted).toEqual({ deletedAt: null });
    });

    it('spread で他の where 条件と合成できること', () => {
      const where = { status: 'DRAFT', ...notDeleted };
      expect(where).toEqual({ status: 'DRAFT', deletedAt: null });
    });

    it('合成時に既存条件を上書きしないこと', () => {
      const where = { ...notDeleted, warehouseId: 1 };
      expect(where.deletedAt).toBeNull();
      expect(where.warehouseId).toBe(1);
    });
  });
});
