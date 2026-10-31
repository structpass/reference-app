import { describe, it, expect } from 'vitest';
import {
  isDefaultPageSizeValid,
  isPageSizeOptionsValid,
  isPageSizeDraftInvalid,
} from '@/features/list-preferences/lib/page-size-draft';

describe('isDefaultPageSizeValid', () => {
  it('1〜10000 の整数を有効とする', () => {
    expect(isDefaultPageSizeValid(1)).toBe(true);
    expect(isDefaultPageSizeValid(50)).toBe(true);
    expect(isDefaultPageSizeValid(10000)).toBe(true);
  });

  it('0 以下・10000 超・非整数を無効とする', () => {
    expect(isDefaultPageSizeValid(0)).toBe(false);
    expect(isDefaultPageSizeValid(-5)).toBe(false);
    expect(isDefaultPageSizeValid(10001)).toBe(false);
    expect(isDefaultPageSizeValid(1.5)).toBe(false);
    expect(isDefaultPageSizeValid(NaN)).toBe(false);
  });
});

describe('isPageSizeOptionsValid', () => {
  it('正整数のカンマ区切りを有効とする', () => {
    expect(isPageSizeOptionsValid('10')).toBe(true);
    expect(isPageSizeOptionsValid('10,20,50,100')).toBe(true);
  });

  it('空・前後カンマ・ゼロ始まり・非数値を無効とする', () => {
    expect(isPageSizeOptionsValid('')).toBe(false);
    expect(isPageSizeOptionsValid('10,')).toBe(false);
    expect(isPageSizeOptionsValid(',10')).toBe(false);
    expect(isPageSizeOptionsValid('0,10')).toBe(false);
    expect(isPageSizeOptionsValid('10,abc')).toBe(false);
    expect(isPageSizeOptionsValid('10 ,20')).toBe(false);
  });

  it('選択肢は最大 10 個まで', () => {
    expect(isPageSizeOptionsValid('1,2,3,4,5,6,7,8,9,10')).toBe(true);
    expect(isPageSizeOptionsValid('1,2,3,4,5,6,7,8,9,10,11')).toBe(false);
  });
});

describe('isPageSizeDraftInvalid', () => {
  it('件数・選択肢が共に有効なら invalid=false', () => {
    expect(isPageSizeDraftInvalid({ defaultPageSize: 20, pageSizeOptions: '10,20,50' })).toBe(
      false,
    );
  });

  it('件数が無効なら invalid=true', () => {
    expect(isPageSizeDraftInvalid({ defaultPageSize: 0, pageSizeOptions: '10,20' })).toBe(true);
  });

  it('選択肢が無効なら invalid=true', () => {
    expect(isPageSizeDraftInvalid({ defaultPageSize: 20, pageSizeOptions: 'bad' })).toBe(true);
  });
});
