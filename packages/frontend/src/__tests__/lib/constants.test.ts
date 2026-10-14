import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, STATUS_VARIANTS, FEATURE_IDS } from '@/lib/constants';

describe('constants', () => {
  describe('STATUS_LABELS', () => {
    it('全ステータスの日本語ラベルが定義されていること', () => {
      expect(STATUS_LABELS.ACTIVE).toBe('有効');
      expect(STATUS_LABELS.INACTIVE).toBe('無効');
      expect(STATUS_LABELS.DRAFT).toBe('下書き');
      expect(STATUS_LABELS.CONFIRMED).toBe('確定');
      expect(STATUS_LABELS.COMPLETED).toBe('完了');
      expect(STATUS_LABELS.SHIPPED).toBe('出荷済');
      expect(STATUS_LABELS.ORDERED).toBe('発注済');
    });
  });

  describe('STATUS_VARIANTS', () => {
    it('全ステータスのバリアントが定義されていること', () => {
      expect(STATUS_VARIANTS.ACTIVE).toBe('success');
      expect(STATUS_VARIANTS.DRAFT).toBe('outline');
      expect(STATUS_VARIANTS.DISCONTINUED).toBe('destructive');
    });
  });

  describe('FEATURE_IDS', () => {
    it('全機能IDが定義されていること', () => {
      expect(FEATURE_IDS.PRODUCT_LIST).toBe('A-1');
      expect(FEATURE_IDS.RECEIVING).toBe('B-1');
      expect(FEATURE_IDS.STOCKTAKING).toBe('C-1');
      expect(FEATURE_IDS.ORDER).toBe('D-1');
    });

    it('21個のフィーチャーIDがあること', () => {
      expect(Object.keys(FEATURE_IDS)).toHaveLength(21);
    });
  });
});
