import { describe, it, expect } from 'vitest';
import {
  FEATURE_CATEGORIES,
  LOGICAL_FEATURES,
  ALL_FEATURES,
  buildLogicalFeatures,
  getFeaturesByCategory,
  getLogicalFeaturesByCategory,
} from '@/features/permissions/lib/feature-list';
import { buildMatrix } from '@/features/permissions/lib/use-permission-matrix';

describe('feature-list', () => {
  describe('FEATURE_CATEGORIES', () => {
    it('6カテゴリ定義されていること (A〜F)', () => {
      expect(FEATURE_CATEGORIES).toHaveLength(6);
      expect(FEATURE_CATEGORIES.map((c) => c.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    });

    it('E カテゴリのラベルが「システム管理」であること', () => {
      const e = FEATURE_CATEGORIES.find((c) => c.key === 'E');
      expect(e?.label).toBe('システム管理');
    });

    it('F カテゴリのラベルが「運用管理」であること', () => {
      const f = FEATURE_CATEGORIES.find((c) => c.key === 'F');
      expect(f?.label).toBe('運用管理');
    });
  });

  describe('LOGICAL_FEATURES (sidebar 由来 SSOT)', () => {
    it('合計件数が 18 件であること（CRUD_SUPPORT 登録漏れの回帰検知）', () => {
      // sidebar nav-config の categoryKey 付きカテゴリにある featureId をユニーク化した数。
      // 内訳: A=7 (products/warehouses/carriers/suppliers/categories/users/groups)
      //       B=3 (receivings/shipments/shipping)
      //       C=3 (stocktakings/stocks/forecast)
      //       D=1 (orders)
      //       E=3 (permissions/system-parameters/object-types) — list-preferences は同じ system-parameters
      //       F=1 (file-import) — dashboard は Rete の Home へ移植済のため除去
      // NavItem を追加・削除した場合は本期待値を更新すること。
      expect(LOGICAL_FEATURES).toHaveLength(18);
    });

    it('sidebar の categoryKey 付きカテゴリの全 featureId を含むこと', () => {
      const ids = LOGICAL_FEATURES.map((f) => f.id);
      // A. マスタ管理
      expect(ids).toContain('products');
      expect(ids).toContain('warehouses');
      expect(ids).toContain('carriers');
      expect(ids).toContain('suppliers');
      expect(ids).toContain('categories');
      expect(ids).toContain('users');
      expect(ids).toContain('groups');
      // B. 入出荷管理
      expect(ids).toContain('receivings');
      expect(ids).toContain('shipments');
      expect(ids).toContain('shipping');
      // C. 在庫管理
      expect(ids).toContain('stocktakings');
      expect(ids).toContain('stocks');
      expect(ids).toContain('forecast');
      // D. 発注管理
      expect(ids).toContain('orders');
      // E. システム管理
      expect(ids).toContain('permissions');
      expect(ids).toContain('system-parameters');
      expect(ids).toContain('object-types');
      // F. 運用管理（dashboard は Rete の Home へ移植済のため除去）
      expect(ids).toContain('file-import');
      expect(ids).not.toContain('dashboard');
    });

    it('file-import は F. 運用管理 カテゴリに属し view+create のみ true であること（SEC-H3: 取込実行を create で gate）', () => {
      const fi = LOGICAL_FEATURES.find((f) => f.id === 'file-import');
      expect(fi?.category).toBe('F');
      expect(fi?.crudSupport).toEqual({
        view: true,
        create: true,
        update: false,
        delete: false,
      });
    });

    it('dashboard は Rete の Home へ移植済のため LOGICAL_FEATURES に含まれないこと', () => {
      const d = LOGICAL_FEATURES.find((f) => (f.id as string) === 'dashboard');
      expect(d).toBeUndefined();
    });

    it('getLogicalFeaturesByCategory("F") は file-import のみで dashboard を含まないこと', () => {
      const f = getLogicalFeaturesByCategory('F');
      const ids = f.map((x) => x.id as string);
      expect(ids).toContain('file-import');
      expect(ids).not.toContain('dashboard');
    });

    it('announcements は権限管理対象外なので含まれないこと', () => {
      const ids = LOGICAL_FEATURES.map((f) => f.id as string);
      expect(ids).not.toContain('announcements');
    });

    it('全 featureId がユニークであること（同一 featureId の NavItem が複数あっても dedupe）', () => {
      const ids = LOGICAL_FEATURES.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('permissions は E.システム管理 カテゴリに属すること', () => {
      const perm = LOGICAL_FEATURES.find((f) => f.id === 'permissions');
      expect(perm?.category).toBe('E');
    });

    it('system-parameters は E.システム管理 カテゴリに属すること', () => {
      const sp = LOGICAL_FEATURES.find((f) => f.id === 'system-parameters');
      expect(sp?.category).toBe('E');
    });

    it('object-types は E.システム管理 カテゴリで作成・更新可能なこと', () => {
      const objectTypes = LOGICAL_FEATURES.find((f) => f.id === 'object-types');
      expect(objectTypes?.category).toBe('E');
      expect(objectTypes?.crudSupport).toEqual({
        view: true,
        create: true,
        update: true,
        delete: false,
      });
    });

    it('SYS_ADMIN専用機能はDBに不整合な行があってもSYS_ADMIN以外を全OFFに固定すること', () => {
      const matrix = buildMatrix([
        {
          role: 'WH_USER',
          featureId: 'object-types',
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
        {
          role: 'SYS_ADMIN',
          featureId: 'object-types',
          canView: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        },
      ]);

      expect(matrix['object-types']).toEqual({
        WH_USER: { canView: false, canCreate: false, canUpdate: false, canDelete: false },
        WH_ADMIN: { canView: false, canCreate: false, canUpdate: false, canDelete: false },
        OF_USER: { canView: false, canCreate: false, canUpdate: false, canDelete: false },
        OF_ADMIN: { canView: false, canCreate: false, canUpdate: false, canDelete: false },
        SYS_ADMIN: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
      });
    });

    it('shipping / stocks / forecast は閲覧専用 (create=false)', () => {
      for (const id of ['shipping', 'stocks', 'forecast']) {
        const f = LOGICAL_FEATURES.find((x) => x.id === id);
        expect(f?.crudSupport.create).toBe(false);
        expect(f?.crudSupport.view).toBe(true);
      }
    });

    it('getLogicalFeaturesByCategory("E") に permissions と system-parameters が含まれること', () => {
      const e = getLogicalFeaturesByCategory('E');
      const ids = e.map((f) => f.id);
      expect(ids).toContain('permissions');
      expect(ids).toContain('system-parameters');
      expect(ids).toContain('object-types');
    });

    it('getLogicalFeaturesByCategory("A") に suppliers / categories が含まれること', () => {
      const a = getLogicalFeaturesByCategory('A');
      const ids = a.map((f) => f.id);
      expect(ids).toContain('suppliers');
      expect(ids).toContain('categories');
      // permissions は E に移動したので A には含まれない
      expect(ids).not.toContain('permissions');
    });

    it('非preset catalog から動的権限行を作り、sortOrder順で追加すること', () => {
      const features = buildLogicalFeatures([
        { key: 'z-ledger', name: 'Z台帳', sortOrder: 20, isPreset: false },
        { key: 'supplier-score', name: '仕入先評価', sortOrder: 6, isPreset: false },
      ]);

      expect(features.slice(-2).map((feature) => feature.id)).toEqual([
        'object-type:supplier-score',
        'object-type:z-ledger',
      ]);
      expect(features.at(-2)).toMatchObject({
        id: 'object-type:supplier-score',
        name: '仕入先評価',
        category: 'A',
        crudSupport: { view: true, create: true, update: true, delete: true },
      });
    });

    it('preset・不正key・壊れた項目を権限行へ入れず重複も除外すること', () => {
      const features = buildLogicalFeatures([
        { key: 'product', name: '商品', sortOrder: 1, isPreset: true },
        { key: 'bad key', name: '不正', sortOrder: 2, isPreset: false },
        { key: 'supplier-score', name: '', sortOrder: 3, isPreset: false },
        { key: 'supplier-score', name: '仕入先評価', sortOrder: 4, isPreset: false },
        { key: 'supplier-score', name: '重複', sortOrder: 5, isPreset: false },
      ]);

      expect(features.filter((feature) => feature.id === 'object-types')).toHaveLength(1);
      expect(
        features.filter((feature) => feature.id === 'object-type:supplier-score'),
      ).toHaveLength(1);
      expect(features.some((feature) => feature.name === '不正')).toBe(false);
      expect(features.some((feature) => feature.name === '商品' && feature.id !== 'products')).toBe(
        false,
      );
    });
  });

  describe('ALL_FEATURES (旧 24 機能 ID 互換)', () => {
    it('ALL_FEATURESが定義されていること', () => {
      expect(ALL_FEATURES.length).toBeGreaterThanOrEqual(20);
    });

    it('各機能にid, name, categoryが存在すること', () => {
      for (const feature of ALL_FEATURES) {
        expect(feature.id).toBeTruthy();
        expect(feature.name).toBeTruthy();
        expect(feature.category).toBeTruthy();
      }
    });

    it('getFeaturesByCategoryでカテゴリ別にフィルタできること', () => {
      const zFeatures = getFeaturesByCategory('Z');
      expect(zFeatures).toHaveLength(2);
      expect(zFeatures.every((f) => f.category === 'Z')).toBe(true);
    });

    it('getFeaturesByCategoryで存在しないカテゴリは空配列を返すこと', () => {
      expect(getFeaturesByCategory('X')).toEqual([]);
    });

    it('全機能のIDがユニークであること', () => {
      const ids = ALL_FEATURES.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
