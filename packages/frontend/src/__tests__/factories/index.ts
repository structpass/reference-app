/**
 * Test entity factories.
 *
 * 全 spec はここから factory を import すること。
 * spec 内で entity 型のオブジェクトリテラルを直書きすると
 * shared 型 drift / mock copy-paste の温床になる
 * （architecture-invariants §3 / §5）。
 *
 * 例:
 *   import { makeUser, makeProduct } from '@/__tests__/factories';
 *   const admin = makeUser({ role: UserRole.SYS_ADMIN });
 */
export { makeBase, BASE_DATE_ISO } from './_base';
export { makeUser } from './user.factory';
export { makeProduct } from './product.factory';
export { makeCategory } from './category.factory';
export { makeWarehouse } from './warehouse.factory';
export { makeCarrier } from './carrier.factory';
export { makeSupplier } from './supplier.factory';
export { makeStock, makeStockWithRelations } from './stock.factory';
export { makeOrder, makeOrderItem } from './order.factory';
export { makeReceiving, makeReceivingLine } from './receiving.factory';
export { makeShipment, makeShipmentLine } from './shipment.factory';
export { makeStocktaking, makeStocktakingItem } from './stocktaking.factory';
export { makeGroup } from './group.factory';
export { makeSystemSetting } from './system-setting.factory';
export {
  makeAnnouncement,
  makeAnnouncementListItem,
  makeAnnouncementAttachment,
} from './announcement.factory';
