import { PrismaService } from '@/database/prisma.service';
import { DocumentNumberRepository } from '@/common/repositories';
import { toJstIso } from '@/common/services/jst-date.service';
import { StocksRepository } from '@/modules/stocks/repositories/stocks.repository';
import { StocksService } from '@/modules/stocks/stocks.service';
import { ReceivingsRepository } from '@/modules/receivings/repositories/receivings.repository';
import { ReceivingsService } from '@/modules/receivings/receivings.service';
import { ShipmentsRepository } from '@/modules/shipments/repositories/shipments.repository';
import { ShipmentsService } from '@/modules/shipments/shipments.service';
import { OrdersRepository } from '@/modules/orders/repositories/orders.repository';
import { OrdersService } from '@/modules/orders/orders.service';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * 入荷・出荷・発注の採番が、実 PostgreSQL 上で並行作成しても重複しないことを実証する統合テスト。
 *
 * 変更前は「最新番号を read → +1」を別トランザクションで行い、その後 INSERT していたため、
 * 並行作成の2件目以降が unique 制約違反で失敗し得た。変更後は番号種別 × 日付単位の
 * transaction advisory lock 下で数値最大の連番 + 1 を算定し、INSERT まで同一トランザクションで
 * 行う。ここでは実 DB に対する並行作成で、
 *
 *   1. 同一日・同一種別の N 件同時作成が全件成功し、番号が全件一意（連番に穴が無い）
 *   2. 番号形式（RCV/SHP/PO + YYYYMMDD + 連番）と桁数が維持される
 *   3. 桁上限を超えても数値としての最大 + 1 が返る（文字列順の最大に依存しない）
 *   4. 失敗した作成が番号を消費しない（同一トランザクションでロールバックする）
 *   5. 種別 × 日付で分離される（他日付・他種別の既存番号に影響されない）
 *
 * を確かめる。mock の unit spec が「Service が採番と INSERT を同一 tx に乗せているか」を見るのに対し、
 * こちらは「実 DB のロックが並行作成を直列化し、番号が重複しないか」を見る（射程が異なり相補的）。
 *
 * Docker 必須のため通常の `pnpm test` から分離（`pnpm test:int`）。
 */
describe('入出荷・発注の採番の並行性 — 実DB統合 (v2-516)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;
  let documentNumberRepository: DocumentNumberRepository;
  let receivings: ReceivingsService;
  let shipments: ShipmentsService;
  let orders: OrdersService;
  let receivingsRepo: ReceivingsRepository;

  let warehouseId: number;
  let supplierId: number;
  let userId: string;
  let productId: string;

  // 採番は日本時間の暦日をプレフィックスに使う（実行環境の時計に従わない）。テスト側も同じ規則で当日を組み立てる。
  const now = new Date();
  const ymd = toJstIso(now)!.slice(0, 10).replaceAll('-', '');
  const isoDate = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  const RCV = `RCV-${ymd}-`;
  const SHP = `SHP-${ymd}-`;
  const PO = `PO-${ymd}-`;

  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  const numbers = (n: number, width: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => `${prefix}${pad(i + 1, width)}`);

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    // 番号を争う同時トランザクションが pool 層でなく advisory lock で直列化されるよう接続を広げる。
    prisma = new PrismaService({ datasourceUrl: `${db.databaseUrl}?connection_limit=30` });
    await prisma.$connect();

    documentNumberRepository = new DocumentNumberRepository();
    const stocksService = new StocksService(new StocksRepository(prisma));
    receivingsRepo = new ReceivingsRepository(prisma);
    receivings = new ReceivingsService(receivingsRepo, documentNumberRepository, stocksService);
    shipments = new ShipmentsService(
      new ShipmentsRepository(prisma),
      documentNumberRepository,
      stocksService,
    );
    orders = new OrdersService(new OrdersRepository(prisma), documentNumberRepository);
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  beforeEach(async () => {
    // 子 → 親 の順（FK 制約順）
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.receivingLine.deleteMany();
    await prisma.receiving.deleteMany();
    await prisma.shipmentLine.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.stockAdjustment.deleteMany();
    await prisma.stock.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { name: 'v2-516 tester', email: `v2-516-${Date.now()}@struct-pass.example` },
    });
    userId = user.id;

    const category = await prisma.category.create({
      data: { code: `V2516-CAT-${Date.now()}`, name: 'v2-516 分類' },
    });
    const product = await prisma.product.create({
      data: {
        code: `V2516-PRD-${Date.now()}`,
        name: 'v2-516 商品',
        categoryId: category.id,
        price: 100,
      },
    });
    productId = product.id;

    const warehouse = await prisma.warehouse.create({
      data: { code: `V2516-WH-${Date.now()}`, name: 'v2-516 倉庫' },
    });
    warehouseId = warehouse.id;

    const supplier = await prisma.supplier.create({
      data: { code: `V2516-SUP-${Date.now()}`, name: 'v2-516 仕入先' },
    });
    supplierId = supplier.id;
  });

  const createReceiving = () =>
    receivings.create(
      {
        receivingDate: isoDate,
        warehouseId,
        supplierId,
        lines: [{ lineNo: 1, productId, plannedQty: 1, actualQty: null }],
      } as never,
      userId,
    );

  const createShipment = () =>
    shipments.create(
      {
        shipmentDate: isoDate,
        warehouseId,
        destination: 'v2-516 出荷先',
        lines: [{ lineNo: 1, productId, plannedQty: 1, actualQty: null }],
      } as never,
      userId,
    );

  const createOrder = () =>
    orders.create(
      {
        orderDate: isoDate,
        supplierId,
        items: [{ lineNo: 1, productId, orderQty: 1, unitPrice: 100 }],
      } as never,
      userId,
    );

  /** 既存番号を直接 INSERT する（当日の桁上限など、前提状態を作るため）。 */
  const seedReceivingNo = (receivingNo: string) =>
    prisma.receiving.create({
      data: {
        receivingNo,
        receivingDate: new Date(isoDate),
        warehouseId,
        supplierId,
        createdBy: userId,
      },
    });

  const seedOrderNo = (orderNo: string) =>
    prisma.order.create({
      data: {
        orderNo,
        orderDate: new Date(isoDate),
        supplierId,
        createdBy: userId,
      },
    });

  // ==========================================================================
  // 受入条件1: 同一日・同一種別の並行作成が全件成功し全件一意
  // ==========================================================================
  describe('並行作成の一意性（受入条件1）', () => {
    it('入荷を20件同時に作成しても番号が 0001..0020 で重複しない', async () => {
      const N = 20;
      const results = await Promise.all(Array.from({ length: N }, () => createReceiving()));

      const nums = results.map((r) => r.data.receivingNo).sort();
      expect(nums).toEqual(numbers(N, 4, RCV));
      expect(new Set(nums).size).toBe(N);
      expect(await prisma.receiving.count()).toBe(N);
    });

    it('出荷を20件同時に作成しても番号が 0001..0020 で重複しない', async () => {
      const N = 20;
      const results = await Promise.all(Array.from({ length: N }, () => createShipment()));

      const nums = results.map((r) => r.data.shipmentNo).sort();
      expect(nums).toEqual(numbers(N, 4, SHP));
      expect(new Set(nums).size).toBe(N);
      expect(await prisma.shipment.count()).toBe(N);
    });

    it('発注を20件同時に作成しても番号が 001..020 で重複しない', async () => {
      const N = 20;
      const results = await Promise.all(Array.from({ length: N }, () => createOrder()));

      const nums = results.map((r) => r.data.orderNo).sort();
      expect(nums).toEqual(numbers(N, 3, PO));
      expect(new Set(nums).size).toBe(N);
      expect(await prisma.order.count()).toBe(N);
    });
  });

  // ==========================================================================
  // 受入条件2: 番号形式（種別 + YYYYMMDD + 桁）
  // ==========================================================================
  it('番号形式（RCV/SHP + YYYYMMDD + 4桁、PO + YYYYMMDD + 3桁）を維持する', async () => {
    const receiving = await createReceiving();
    const shipment = await createShipment();
    const order = await createOrder();

    expect(receiving.data.receivingNo).toMatch(new RegExp(`^RCV-${ymd}-\\d{4}$`));
    expect(shipment.data.shipmentNo).toMatch(new RegExp(`^SHP-${ymd}-\\d{4}$`));
    expect(order.data.orderNo).toMatch(new RegExp(`^PO-${ymd}-\\d{3}$`));
  });

  // ==========================================================================
  // 受入条件3: 桁上限超過でも数値として最大の連番 +1（文字列順に依存しない）
  // ==========================================================================
  it('入荷の連番が 9999 の次は 10000 になる（数値最大で算定）', async () => {
    await seedReceivingNo(`${RCV}9999`);
    const result = await createReceiving();
    expect(result.data.receivingNo).toBe(`${RCV}10000`);
  });

  it('発注の連番が 999 の次は 1000 になる（3桁を超えても続く）', async () => {
    await seedOrderNo(`${PO}999`);
    const result = await createOrder();
    expect(result.data.orderNo).toBe(`${PO}1000`);
  });

  it('9999 と 10000 が混在していても数値最大 +1 を返す（文字列 desc では誤る境界）', async () => {
    // 文字列の降順では "…9999" > "…10000" となり 9999 を最大と誤認する。
    await seedReceivingNo(`${RCV}10000`);
    await seedReceivingNo(`${RCV}9999`);
    const result = await createReceiving();
    expect(result.data.receivingNo).toBe(`${RCV}10001`);
  });

  // ==========================================================================
  // 受入条件4: 失敗した作成は番号を消費しない（同一 tx でロールバック）
  // ==========================================================================
  it('INSERT が失敗すると番号は消費されず、次の作成は 0001 から始まる', async () => {
    const spy = jest
      .spyOn(receivingsRepo, 'createInTx')
      .mockRejectedValueOnce(new Error('v2-516 injected failure'));
    try {
      await expect(createReceiving()).rejects.toThrow('v2-516 injected failure');
    } finally {
      spy.mockRestore();
    }

    expect(await prisma.receiving.count()).toBe(0); // 番号も行も残らない

    const next = await createReceiving();
    expect(next.data.receivingNo).toBe(`${RCV}0001`);
  });

  // ==========================================================================
  // 受入条件6: 種別 × 日付で分離する
  // ==========================================================================
  it('他日付の既存番号は当日の採番に影響しない', async () => {
    await seedReceivingNo('RCV-20000101-0009');
    const result = await createReceiving();
    expect(result.data.receivingNo).toBe(`${RCV}0001`);
  });

  it('他種別（入荷）の当日番号は発注の採番に影響しない', async () => {
    const receiving = await createReceiving();
    expect(receiving.data.receivingNo).toBe(`${RCV}0001`);

    const order = await createOrder();
    expect(order.data.orderNo).toBe(`${PO}001`);
  });
});
