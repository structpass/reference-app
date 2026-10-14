import { AdjustmentType } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { StocksRepository } from '@/modules/stocks/repositories/stocks.repository';
import { StocksService } from '@/modules/stocks/stocks.service';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * Phase 1b: 在庫の悲観ロック（FOR UPDATE + ensure-row）が、実 PostgreSQL 上で
 * 同時実行を直列化し lost update を生まないことを実証する統合テスト。
 *
 * mock-unit（repository-tx-identity）が「更新が同一 tx に乗っているか」を保証するのに対し、
 * こちらは「本物の行ロックが競合を直列化するか」を実 DB で確かめる。射程が異なり相補的:
 *   - CODE-H1（偽原子性 / lost update）の最終証明
 *   - CODE-H3（空行は FOR UPDATE できない → ensure-row で先に行を確保）の最終証明
 *
 * Docker 必須のため通常の `pnpm test` から分離（`pnpm test:int`）。
 * 全 tx が pool 待ちでなく実際に行ロックで競合するよう connection_limit を N 以上に上げる。
 *
 * 【証明構造】中核の不変条件は「確定値 == 初期値 + ΣDELTA」（lost update があれば必ず崩れる）。
 * 監査チェーンの before 値が全 distinct / 各行 after==before+DELTA は、直列化を補強する証拠で
 * あって主たる証明ではない。ensure-row（空行への同時 INSERT ON CONFLICT DO UPDATE が行ロックを
 * 取る）経路は test1 が N=20 で踏ませるが、ロック取得自体を直接 assert する手段は無い（PG 内部
 * 挙動）。よって「確定値の算術的正しさ」を主軸に置き、それが崩れない限り直列化されていると論じる。
 * 統合テストの本質的限界として「並行が薄くても緑」になる偽陽性は完全には排除できない。
 */
describe('在庫並行更新の直列化 — 実DB統合 (Phase 1b)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;
  let service: StocksService;

  let warehouseId: number;
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    // connection_limit を上げ、同時 tx が pool 層でなく行ロックで直列化されるようにする
    // （ここを絞ると「pool が直列化しただけ」になり FOR UPDATE の証明にならない）。
    // process.env を汚さず datasourceUrl で接続先を明示する（int-spec 増加時の env 漏れ回避）。
    const url = `${db.databaseUrl}?connection_limit=30`;
    prisma = new PrismaService({ datasourceUrl: url });
    await prisma.$connect();
    service = new StocksService(new StocksRepository(prisma));
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  // 各ケースでマスタを作り直す。Stock 行を作る/作らないはケース別に制御する。
  // 全削除の安全性は jest-integration.json の maxWorkers:1（spec 直列実行）に依存する。
  beforeEach(async () => {
    // 子 → 親 の順で全削除（FK 制約順: stockAdjustment は warehouse/product/user を参照）
    await prisma.stockAdjustment.deleteMany();
    await prisma.stock.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.user.deleteMany();

    // SSO 一本化で username / passwordHash は撤去。stockAdjustment.userId の FK 充足が目的のため
    // 必須項目（name / email）のみで作成する（oidcSub は nullable、isActive は default true）。
    const user = await prisma.user.create({
      data: { name: 'int-tester', email: 'int@test.local' },
    });
    userId = user.id;

    const category = await prisma.category.create({
      data: { code: 'INT-CAT', name: '統合テスト分類' },
    });
    const product = await prisma.product.create({
      data: { code: 'INT-PROD', name: '統合テスト商品', categoryId: category.id, price: 100 },
    });
    productId = product.id;

    const warehouse = await prisma.warehouse.create({
      data: { code: 'INT-WH', name: '統合テスト倉庫' },
    });
    warehouseId = warehouse.id;
  });

  /** 1 件の adjustStock を独立した interactive transaction で実行する。 */
  function runAdjust(delta: number, type: AdjustmentType, reason: string) {
    return prisma.$transaction(
      (tx) => service.adjustStock(tx, warehouseId, productId, delta, type, userId, reason),
      { timeout: 30000, maxWait: 30000 },
    );
  }

  it('空行からの同時入荷 N 件が ensure-row + FOR UPDATE で直列化され lost update を生まない', async () => {
    const N = 20;
    const DELTA = 5;

    // Stock 行を作らずに開始 → 同時 INSERT 競合（CODE-H3 の最も race-prone な経路）を踏ませる
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        runAdjust(DELTA, AdjustmentType.RECEIVING, `concurrent-in-${i}`),
      ),
    );

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    // lost update があれば < N*DELTA になる
    expect(stock.quantity).toBe(N * DELTA);

    // 監査チェーンの before 値が全て distinct（0,5,...,95）＝完全直列化の証明。
    // torn read があれば同じ before が 2 回現れ重複する。
    const adjustments = await prisma.stockAdjustment.findMany({
      where: { warehouseId, productId },
      orderBy: { quantityBefore: 'asc' },
    });
    expect(adjustments).toHaveLength(N);
    const befores = adjustments.map((a) => a.quantityBefore);
    expect(new Set(befores).size).toBe(N);
    expect(befores).toEqual(Array.from({ length: N }, (_, i) => i * DELTA));
    for (const a of adjustments) {
      expect(a.quantityAfter).toBe(a.quantityBefore + DELTA);
    }
  });

  it('既存在庫からの同時出荷 N 件が直列化され確定値が算術的に正しい（oversell は許容）', async () => {
    const N = 20;
    const DELTA = -1;
    const INITIAL = 10;

    await prisma.stock.create({ data: { warehouseId, productId, quantity: INITIAL } });

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        runAdjust(DELTA, AdjustmentType.SHIPMENT, `concurrent-out-${i}`),
      ),
    );

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    // 10 + 20*(-1) = -10。出荷確定は在庫不足でも reject せず負在庫を許容する設計のため、
    // 不変条件は「reject される」ではなく「最終値が算術的に正しい（lost update なし）」。
    expect(stock.quantity).toBe(INITIAL + N * DELTA);

    const adjustments = await prisma.stockAdjustment.findMany({
      where: { warehouseId, productId },
      orderBy: { quantityBefore: 'desc' },
    });
    expect(adjustments).toHaveLength(N);
    const befores = adjustments.map((a) => a.quantityBefore);
    expect(new Set(befores).size).toBe(N); // 全 distinct = 直列化
    expect(befores).toEqual(Array.from({ length: N }, (_, i) => INITIAL - i)); // 10,9,...,-9
    // Test 1 と対称に、各監査行の after==before+DELTA も確認する（確定値の局所整合）。
    for (const a of adjustments) {
      expect(a.quantityAfter).toBe(a.quantityBefore + DELTA);
    }
  });
});
