/**
 * MSW handlers — API モックの中央定義。
 *
 * デフォルト handler はここに集約し、per-spec の override は
 * `server.use(...)` で行う。
 *
 * 命名規約:
 *   - handler は `<entity><Action>Handler` (例: productsListHandler)
 *   - エンティティごとに `handlers/<entity>.handlers.ts` に分割し、ここで合流
 */
import { type HttpHandler } from 'msw';
import { allPermissionsHandler } from './handlers/permissions.handlers';
import {
  productsListHandler,
  productsDeleteHandler,
  categoriesListHandler,
  categoriesDeleteHandler,
} from './handlers/products.handlers';
import {
  masterListHandler,
  masterDeleteHandler,
  defaultCarriers,
  defaultSuppliers,
  defaultWarehouses,
} from './handlers/masters.handlers';
import { groupsListHandler, groupsDeleteHandler } from './handlers/groups.handlers';
import { usersListHandler, usersDeleteHandler } from './handlers/users.handlers';
import {
  permissionsRolesGetHandler,
  permissionsRolesPutHandler,
} from './handlers/permissions-matrix.handlers';
import { stocksListHandler, forecastListHandler } from './handlers/stocks.handlers';
import {
  ordersListHandler,
  shipmentsListHandler,
  receivingsListHandler,
  stocktakingsListHandler,
} from './handlers/documents.handlers';
import { importsSuccessHandler, importsTemplateHandler } from './handlers/imports.handlers';
import { objectTypesHandler } from './handlers/object-types.handlers';

export const handlers: HttpHandler[] = [
  allPermissionsHandler,
  productsListHandler(),
  productsDeleteHandler,
  categoriesListHandler(),
  categoriesDeleteHandler,
  masterListHandler('/carriers', defaultCarriers),
  masterDeleteHandler('/carriers'),
  masterListHandler('/suppliers', defaultSuppliers),
  masterDeleteHandler('/suppliers'),
  masterListHandler('/warehouses', defaultWarehouses),
  masterDeleteHandler('/warehouses'),
  groupsListHandler(),
  groupsDeleteHandler,
  usersListHandler(),
  usersDeleteHandler,
  permissionsRolesGetHandler(),
  permissionsRolesPutHandler,
  stocksListHandler(),
  forecastListHandler(),
  ordersListHandler(),
  shipmentsListHandler(),
  receivingsListHandler(),
  stocktakingsListHandler(),
  importsSuccessHandler(),
  importsTemplateHandler,
  ...objectTypesHandler,
];
