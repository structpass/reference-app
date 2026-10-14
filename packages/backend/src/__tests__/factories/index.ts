/**
 * Backend test entity factories.
 *
 * mapper / repository / service spec で entity モックを作る時の中央窓口。
 * spec 内に entity の object literal を直書きするのは禁止
 * （architecture-invariants §3 / §5）。
 *
 * 例:
 *   import { makeProductEntity } from '@/__tests__/factories';
 *   const entity = makeProductEntity({ price: new Prisma.Decimal('500') });
 */
export { makeBase, BASE_DATE, BASE_DATE_ISO } from './_base';
export { makeProductEntity } from './product.factory';
export { makeOrderEntity, makeOrderItemEntity } from './order.factory';
export { makeReceivingEntity, makeReceivingLineEntity } from './receiving.factory';
export { makeShipmentEntity, makeShipmentLineEntity } from './shipment.factory';
export { makeStocktakingEntity, makeStocktakingItemEntity } from './stocktaking.factory';
export { makeUserEntity, makeUserWithGroupsEntity } from './user.factory';
export {
  makeGroupEntity,
  makeGroupMemberEntity,
  makeGroupWithMembersEntity,
} from './group.factory';
export { makeSystemSettingEntity } from './system-setting.factory';
export { makeAnnouncementEntity, makeAnnouncementAttachmentEntity } from './announcement.factory';
export { makeCarrierEntity } from './carrier.factory';
export { makeSupplierEntity } from './supplier.factory';
export { makeWarehouseEntity } from './warehouse.factory';
export { makeCategoryEntity } from './category.factory';
export { makeRolePermissionEntity } from './permission.factory';
export { makeStockWithRelationsEntity, makeStockWithExportRelationsEntity } from './stock.factory';
export { makeObjectTypeEntity } from './object-type.factory';
