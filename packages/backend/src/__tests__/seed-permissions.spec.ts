import { FEATURES, FEATURE_CATEGORY_MAP } from '../../prisma/seed/permissions';

describe('seed/permissions — 分類漏れの fail-closed（ref-0079）', () => {
  it('全 FEATURES がいずれかの分類に属していること（分類漏れゼロ＝fail-closed の対象外）', () => {
    for (const feat of FEATURES) {
      expect(FEATURE_CATEGORY_MAP[feat]).toBeDefined();
    }
  });

  it('FEATURE_CATEGORY_MAP に FEATURES 以外のキーが無いこと（孤立した分類定義の防止）', () => {
    const mapKeys = Object.keys(FEATURE_CATEGORY_MAP);
    const featureSet = new Set(FEATURES);
    for (const key of mapKeys) {
      expect(featureSet.has(key)).toBe(true);
    }
  });

  it('各 FEATURES はちょうど 1 つの分類に属していること（重複は FEATURE_CATEGORY_MAP 構築で throw）', () => {
    // 構築時に重複があると export 自体が throw するため、ここに到達すること自体が「重複ゼロ」の保証。
    // 加えて map の件数が FEATURES と一致する（= 全機能が一意に分類されている）ことを明示する。
    expect(Object.keys(FEATURE_CATEGORY_MAP)).toHaveLength(FEATURES.length);
  });
});
