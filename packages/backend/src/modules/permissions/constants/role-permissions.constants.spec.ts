import { DEFAULT_ROLE_PERMISSIONS, SYS_ADMIN_ONLY_FEATURES } from './role-permissions.constants';
import { FEATURES } from '../../../../prisma/seed/permissions';
import { UserRole } from '@prisma/client';

describe('DEFAULT_ROLE_PERMISSIONS — キー集合一致（ref-0079）', () => {
  it('コード側の初期値と seed 側の機能一覧が完全一致すること（片方だけに足すと失敗する）', () => {
    const codeKeys = Object.keys(DEFAULT_ROLE_PERMISSIONS).sort();
    const seedKeys = [...FEATURES].sort();
    expect(seedKeys).toEqual(codeKeys);
  });
});

describe('SYS_ADMIN_ONLY_FEATURES — 専用機能集合の一致（v2-274）', () => {
  // 非 SYS_ADMIN 4 ロールすべてが NONE の機能＝SYS_ADMIN 専用。片側だけ増減すると失敗する
  // （保存 API の拒否・実効権限の固定・権限マトリクス表示が同じ集合を指すことを固定する）。
  it('DEFAULT_ROLE_PERMISSIONS で全ロール NONE の機能と完全一致すること', () => {
    const noneFeatures = Object.entries(DEFAULT_ROLE_PERMISSIONS)
      .filter(([, roleDefaults]) =>
        [UserRole.WH_USER, UserRole.WH_ADMIN, UserRole.OF_USER, UserRole.OF_ADMIN].every(
          (role) =>
            roleDefaults[role] !== undefined &&
            !roleDefaults[role].canView &&
            !roleDefaults[role].canCreate &&
            !roleDefaults[role].canUpdate &&
            !roleDefaults[role].canDelete,
        ),
      )
      .map(([featureId]) => featureId)
      .sort();

    expect(noneFeatures).toEqual([...SYS_ADMIN_ONLY_FEATURES].sort());
  });

  it('SYS_ADMIN 専用機能は本 map に SYS_ADMIN 行を持たないこと（bypass が全 action 許可する）', () => {
    for (const featureId of SYS_ADMIN_ONLY_FEATURES) {
      expect(DEFAULT_ROLE_PERMISSIONS[featureId]?.['SYS_ADMIN']).toBeUndefined();
    }
  });
});

describe('DEFAULT_ROLE_PERMISSIONS — file-import 権限境界（SEC-H3）', () => {
  const fileImport = DEFAULT_ROLE_PERMISSIONS['file-import'];

  it('WH_ADMIN / OF_ADMIN は view + create を持つこと（取込 = 書き込み操作の実行権）', () => {
    for (const role of ['WH_ADMIN', 'OF_ADMIN']) {
      expect(fileImport[role]).toMatchObject({ canView: true, canCreate: true });
    }
  });

  it('取込ツールに概念のない update / delete は管理者にも付与しないこと（最小権限）', () => {
    for (const role of ['WH_ADMIN', 'OF_ADMIN']) {
      expect(fileImport[role]).toMatchObject({ canUpdate: false, canDelete: false });
    }
  });

  it('一般 user（WH_USER / OF_USER）は取込にアクセスできないこと', () => {
    for (const role of ['WH_USER', 'OF_USER']) {
      expect(fileImport[role]).toMatchObject({ canView: false, canCreate: false });
    }
  });

  it('SYS_ADMIN は本 map に載せないこと（service 層の全機能バイパスで CRUD になる前提）', () => {
    expect(fileImport['SYS_ADMIN']).toBeUndefined();
  });
});

describe('DEFAULT_ROLE_PERMISSIONS — object-types 権限（ref-0069）', () => {
  // SYS_ADMIN が object-types へアクセスできるよう、DEFAULT_ROLE_PERMISSIONS にキー登録する。
  // SYS_ADMIN は service 層 bypass で全機能を全 action 許可するため、key 登録だけで自動的に
  // canView=true / canCreate=true / canUpdate=true / canDelete=true を持つ。
  // 設計案A: SYS_ADMIN への権限付与は DEFAULT_ROLE_PERMISSIONS キー追加で実現し、
  // SYS_ADMIN 経路のロジックは変更しない（DB overlay を読まない既存設計を維持）。
  const objectTypes = DEFAULT_ROLE_PERMISSIONS['object-types'];

  it('feature key が DEFAULT_ROLE_PERMISSIONS に登録されていること（service 層 bypass の対象にする）', () => {
    expect(objectTypes).toBeDefined();
  });

  it('非 admin role は NONE 固定であること（v2-274: DB overlay でも個別付与できない）', () => {
    for (const role of ['WH_USER', 'WH_ADMIN', 'OF_USER', 'OF_ADMIN']) {
      expect(objectTypes[role]).toMatchObject({
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      });
    }
  });

  it('SYS_ADMIN_ONLY_FEATURES に含まれること（保存 API と実効権限の抑制対象）', () => {
    expect(SYS_ADMIN_ONLY_FEATURES.has('object-types')).toBe(true);
  });

  it('SYS_ADMIN は本 map に載せないこと（bypass が別途全 action 許可するため）', () => {
    expect(objectTypes['SYS_ADMIN']).toBeUndefined();
  });
});
