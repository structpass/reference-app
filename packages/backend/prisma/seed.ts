import { PrismaClient } from '@prisma/client';
import { validateDatabasePoolLimits } from '../src/common/config/env-validation';
import { seededRandom } from './seed/helpers';
import { seedUsers } from './seed/users';
import { seedCategories } from './seed/categories';
import { seedProducts } from './seed/products';
import { seedWarehouses } from './seed/warehouses';
import { seedCarriers } from './seed/carriers';
import { seedSuppliers } from './seed/suppliers';
import { seedGroups, seedUserGroups } from './seed/groups';
import { seedRolePermissions } from './seed/permissions';
import { cleanupAnnouncementsPermission } from './seed/cleanup-announcements-permission';
import { seedSystemSettings } from './seed/system-settings';
import { seedTablePaginationSettings } from './seed/table-pagination-settings';
import { seedStocks } from './seed/stocks';
import { seedReceivings } from './seed/receivings';
import { seedShipments } from './seed/shipments';
import { seedOrders } from './seed/orders';
import { seedStocktakings } from './seed/stocktakings';
import { seedAnnouncements } from './seed/announcements';
import { seedObjectTypes } from './seed/object-types';

const prisma = new PrismaClient();

async function cleanTransactionData() {
  console.log('Cleaning transaction data...');
  await prisma.stocktakingItem.deleteMany();
  await prisma.stocktaking.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.shipmentLine.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.receivingLine.deleteMany();
  await prisma.receiving.deleteMany();
  await prisma.stock.deleteMany();
  console.log('Transaction data cleaned.');
}

async function main() {
  console.log('Starting seed...');

  // 接続プール上限の検査（ref-0071・rete cmn-0347 の移植）。seed は独立プロセスで main.ts の検査を
  // 通らないため、環境構築の順序（DB 作成 → seed → アプリ配備）でプール指定なしのまま進むのを防ぐ。
  // 警告のみで止めない（本番同様の起動拒否をすると環境構築の順序が壊れる）。
  // 対象は稼働中の本スクリプトのみ＝seed-announcements-only.ts は未使用判定済みの旧スクリプトのため対象外。
  const seedPoolProblem = validateDatabasePoolLimits(process.env.DATABASE_URL);
  if (seedPoolProblem) {
    console.warn(`[seed] ${seedPoolProblem}`);
    console.warn(
      '[seed] このまま続行しますが、アプリ本体（main.ts）は本番で起動を拒否します（dev は警告のみ）。' +
        ' .env の DATABASE_URL へ ?connection_limit=5&pool_timeout=70 相当を設定してください。',
    );
  }

  // seed は dev / demo 専用。固定 UUID の bootstrap 管理者・デモデータを本番に流し込まない。
  // ref-0086: 以前は「NODE_ENV=production かつ SUB 未設定時」だけ拒否していたが、SUB 常設で
  // ガードが空洞化するため NODE_ENV=production 無条件拒否へ締めた（デモ seed 非流入の防壁）。
  // 本番の初期管理者は prisma/bootstrap-admin.mjs（SYS_ADMIN 1 名のみ・冪等）で作る。
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed in production. This seed creates demo accounts and is intended for dev only. ' +
        'Use `node prisma/bootstrap-admin.mjs` for the production initial admin.',
    );
  }

  const rng = seededRandom(42);

  // 認証情報（password）は rete(IdP) が保持するため reference seed では扱わない（SSO 一本化）。
  // ============================================================
  // Master data
  // ============================================================
  const users = await seedUsers(prisma);
  const categoryMap = await seedCategories(prisma);
  const products = await seedProducts(prisma, categoryMap, users.sysAdmin.id, rng);
  const warehouses = await seedWarehouses(prisma, users.whAdmin.name);
  const carriers = await seedCarriers(prisma);
  const suppliers = await seedSuppliers(prisma);
  const groups = await seedGroups(prisma);
  await seedUserGroups(prisma, users, groups);

  // ============================================================
  // Transaction data (clean then recreate)
  // ============================================================
  await cleanTransactionData();

  const userIds = [users.sysAdmin.id, users.whAdmin.id, users.tanaka.id];

  const stocks = await seedStocks(prisma, warehouses, products, rng);
  await seedReceivings(prisma, { products, warehouses, suppliers, userIds, rng });
  await seedShipments(prisma, { products, warehouses, carriers, userIds, rng });
  await seedOrders(prisma, { products, suppliers, userIds, rng });
  await seedStocktakings(prisma, { warehouses, stocks, userIds, rng });

  // ============================================================
  // Permissions
  // ============================================================
  await seedRolePermissions(prisma);
  await cleanupAnnouncementsPermission(prisma);

  // ============================================================
  // System Settings
  // ============================================================
  await seedSystemSettings(prisma);
  await seedTablePaginationSettings(prisma);

  // ============================================================
  // Announcements (掲示板)
  // ============================================================
  await seedAnnouncements(prisma, { creatorUserId: users.sysAdmin.id, groups });

  // ============================================================
  // Metamodel: ObjectType presets (ref-0013 Phase 1)
  // ============================================================
  await seedObjectTypes(prisma);

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
