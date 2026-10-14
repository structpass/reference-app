import { Prisma } from '@prisma/client';
import { decimalToNumber, decimalToNumberNullable } from './prisma-decimal.helper';

describe('prisma-decimal.helper', () => {
  describe('decimalToNumber', () => {
    it('number はそのまま返すこと', () => {
      expect(decimalToNumber(42)).toBe(42);
      expect(decimalToNumber(0)).toBe(0);
    });

    it('Prisma.Decimal を number に変換すること', () => {
      expect(decimalToNumber(new Prisma.Decimal('1234.56'))).toBe(1234.56);
    });

    it('toNumber を持つ任意の DecimalLike を変換すること（structural typing）', () => {
      const fake = { toNumber: () => 7.5 };
      expect(decimalToNumber(fake)).toBe(7.5);
    });
  });

  describe('decimalToNumberNullable', () => {
    it('null / undefined は null を返すこと', () => {
      expect(decimalToNumberNullable(null)).toBeNull();
      expect(decimalToNumberNullable(undefined)).toBeNull();
    });

    it('非 null の Decimal は number に変換すること', () => {
      expect(decimalToNumberNullable(new Prisma.Decimal('999.99'))).toBe(999.99);
    });

    it('0 を null と取り違えないこと（falsy 混同の回帰防止）', () => {
      expect(decimalToNumberNullable(new Prisma.Decimal(0))).toBe(0);
      expect(decimalToNumberNullable(0)).toBe(0);
    });
  });

  // TEST-M2: 金額は qty × unitPrice を Prisma.Decimal で計算し DB(@db.Decimal(p,2)) に
  // 格納する（orders.service の amount/totalAmount と同経路）。小数 2 桁での丸め・
  // 合算が IEEE754 float の誤差を持ち込まずに number へ落ちることを実値で検証する。
  describe('Decimal 精度 — qty × unitPrice の丸め（TEST-M2）', () => {
    const amount = (qty: number, unitPrice: number) => new Prisma.Decimal(qty).times(unitPrice);

    it('小数 2 桁単価 × 数量を誤差なく number 化すること', () => {
      // 0.1 + 0.2 が float では 0.30000000000000004 になる古典的ケースを
      // Decimal 経由で正しく扱えること。
      expect(decimalToNumber(amount(3, 0.1))).toBe(0.3);
      expect(decimalToNumber(amount(7, 1.1))).toBe(7.7);
    });

    it('小数 2 桁へ丸めた金額を正確に保持すること', () => {
      const rounded = new Prisma.Decimal('19.99').times(3).toDecimalPlaces(2); // 59.97
      expect(decimalToNumber(rounded)).toBe(59.97);
    });

    it('複数明細の合算が float 誤差を持ち込まないこと', () => {
      const lines = [amount(1, 10.1), amount(2, 20.2), amount(3, 0.01)];
      const total = lines.reduce((sum, a) => sum.add(a), new Prisma.Decimal(0));
      // 10.1 + 40.4 + 0.03 = 50.53
      expect(decimalToNumber(total)).toBe(50.53);
    });
  });
});
