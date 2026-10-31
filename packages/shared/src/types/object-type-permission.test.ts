import { describe, expect, it } from 'vitest';
import {
  isObjectTypePermissionId,
  isValidObjectTypeKey,
  objectTypeKeyFromPermissionId,
  objectTypePermissionId,
  OBJECT_TYPE_PERMISSION_PREFIX,
} from './object-type-permission';

// d808: ここは権限の名前空間を決める 4 つの関数で、API・ガード・権限画面が同じ判定を
// 共有している。片方だけを変えると「画面では作れるが保存できない」「見えないはずの台帳の
// 権限が見える」のどちらかになるため、往復（作る→読む）と境界を固定する。
describe('object-type の権限 ID', () => {
  it('接頭辞が固定されていること（保存済みの権限行はこの文字列をキーに持つ）', () => {
    expect(OBJECT_TYPE_PERMISSION_PREFIX).toBe('object-type:');
  });

  it('作った ID から同じキーが戻ること（往復）', () => {
    expect(objectTypeKeyFromPermissionId(objectTypePermissionId('equipment'))).toBe('equipment');
  });

  it('接頭辞の無い ID は ObjectType の権限として扱わないこと', () => {
    for (const id of ['products', 'users', '', 'objecttype:equipment']) {
      expect(objectTypeKeyFromPermissionId(id)).toBeNull();
      expect(isObjectTypePermissionId(id)).toBe(false);
    }
  });

  it('接頭辞だけでキーが無い ID は無効であること', () => {
    expect(objectTypeKeyFromPermissionId(OBJECT_TYPE_PERMISSION_PREFIX)).toBeNull();
  });

  it('キーの形（先頭は英小文字・ハイフン区切り）を守ること', () => {
    expect(isValidObjectTypeKey('equipment')).toBe(true);
    expect(isValidObjectTypeKey('office-supply')).toBe(true);
    for (const key of ['', 'Equipment', '-equipment', 'equipment-', 'equipment--supply', '1st']) {
      expect(isValidObjectTypeKey(key)).toBe(false);
    }
  });

  it('キーの長さ上限（100 文字）の境目で判定が分かれること', () => {
    expect(isValidObjectTypeKey('a'.repeat(100))).toBe(true);
    expect(isValidObjectTypeKey('a'.repeat(101))).toBe(false);
  });

  it('isObjectTypePermissionId は isValidObjectTypeKey と同じ判定を通ること', () => {
    expect(isObjectTypePermissionId(objectTypePermissionId('equipment'))).toBe(true);
    // 接頭辞はあるがキーが不正（大文字）＝ 固定機能の名前空間へ取り込ませない。
    expect(isObjectTypePermissionId(`${OBJECT_TYPE_PERMISSION_PREFIX}Equipment`)).toBe(false);
  });
});
