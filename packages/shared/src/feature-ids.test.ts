import { describe, expect, it } from 'vitest';
import { FEATURE_IDS } from './feature-ids';

// d808: FEATURE_IDS は FeatureId 型の導出元で、backend の権限判定（DEFAULT_ROLE_PERMISSIONS・
// PermissionGuard）と frontend の画面ガードの双方がここを経由する。値を消す・重複させる・
// 空文字を混ぜる、のいずれをしても型は通るため、試験で形を固定する。
describe('FEATURE_IDS', () => {
  it('重複が無いこと', () => {
    expect(new Set(FEATURE_IDS).size).toBe(FEATURE_IDS.length);
  });

  it('空文字を含まないこと', () => {
    expect(FEATURE_IDS.every((id) => id.length > 0)).toBe(true);
  });

  it('kebab-case（小文字の英数字と単語区切りのハイフン）であること', () => {
    // 権限データはこの値をキーに保存される。大文字や空白が混ざると既存行と突き合わなくなる。
    expect(FEATURE_IDS.every((id) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
  });

  it('既定の権限カタログが扱う機能を含むこと（値の取り違えを検出する）', () => {
    // 機能を足すこと自体は妨げない。ここは「消えた・別の名前に化けた」を見る最小の錠。
    for (const id of ['products', 'users', 'groups', 'orders', 'permissions', 'object-types']) {
      expect(FEATURE_IDS).toContain(id);
    }
  });

  it('ObjectType の名前空間（object-type: 接頭辞）と衝突しないこと', () => {
    // 接頭辞の付いた ID は利用者が定義する台帳の権限に割り当てられている。ここに同じ形の値が
    // 入ると、固定の機能と利用者の台帳の権限が同じ名前空間を奪い合う。
    expect(FEATURE_IDS.every((id) => !id.includes(':'))).toBe(true);
  });
});
