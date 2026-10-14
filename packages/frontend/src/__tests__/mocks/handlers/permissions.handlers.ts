import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

/**
 * 全 feature に対し full CRUD 権限を返す default permissions handler.
 * usePermissions が `/permissions/my-permissions` を呼び出す前提。
 *
 * 個別 page で「権限なし」状態を検証したい場合は per-spec で
 * `server.use(deniedPermissionsHandler)` で override する。
 */
const ALL_FEATURES = [
  'products',
  'categories',
  'suppliers',
  'carriers',
  'warehouses',
  'groups',
  'users',
  'orders',
  'shipments',
  'shipping',
  'receivings',
  'stocktakings',
  'stocks',
  'permissions',
  'system-parameters',
  'forecast',
  'file-import',
  'object-types',
  'object-type:supplier-score',
  'object-type:vendor-audit',
];

export const allPermissionsHandler = http.get(apiPath('/permissions/my-permissions'), () =>
  HttpResponse.json({
    data: {
      permissions: ALL_FEATURES.map((featureId) => ({
        featureId,
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      })),
    },
  }),
);

export const deniedPermissionsHandler = http.get(apiPath('/permissions/my-permissions'), () =>
  HttpResponse.json({ data: { permissions: [] } }),
);

/**
 * 全 feature に対し canView のみ true、create/update/delete は false。
 * 「権限がない場合は新規/編集/削除ボタンが描画されない」系の integration テストで使う。
 * FeatureGuard の view ガードは通過し、page 本体は描画される。
 */
export const viewOnlyPermissionsHandler = http.get(apiPath('/permissions/my-permissions'), () =>
  HttpResponse.json({
    data: {
      permissions: ALL_FEATURES.map((featureId) => ({
        featureId,
        canView: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      })),
    },
  }),
);
