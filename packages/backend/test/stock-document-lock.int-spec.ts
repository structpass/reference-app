import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { StocksRepository } from '@/modules/stocks/repositories/stocks.repository';
import { StocksService } from '@/modules/stocks/stocks.service';
import { ReceivingsRepository } from '@/modules/receivings/repositories/receivings.repository';
import { ReceivingsService } from '@/modules/receivings/receivings.service';
import { ShipmentsRepository } from '@/modules/shipments/repositories/shipments.repository';
import { ShipmentsService } from '@/modules/shipments/shipments.service';
import { StocktakingsRepository } from '@/modules/stocktakings/repositories/stocktakings.repository';
import { StocktakingsService } from '@/modules/stocktakings/stocktakings.service';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * v2-514: 入荷・出荷・棚卸の状態遷移が、在庫更新と同じロック境界（伝票行 FOR UPDATE →
 * ロック後の最新 status 判定）で直列化されることを実 PostgreSQL 上の同時実行で実証する。
 *
 * mock-unit（repository-tx-identity / Service spec）は「文書ロックと在庫更新が同一 tx に
 * 乗るか」を保証する。本 spec は「本物の行ロックが並行 confirm を直列化し、二重計上や
 * 二重逆計上を防ぐか」を実 DB で確かめる。射程が異なり相補的。
 *
 * 中核の不変条件は在庫の確定値と監査（stockAdjustment）件数。二重計上があればどちらかが
 * 必ず崩れる。採番（DocumentNumberService）は本 spec の対象外のため、Service の create を
 * 使わず伝票を直接作る（採番 stub は型充足のダミーで、確認経路では呼ばれない）。
 */
describe('入出荷・棚卸の状態遷移ロック — 実DB統合 (v2-514)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;
  let receivingsRepo: ReceivingsRepository;
  let receivings: ReceivingsService;
  let shipments: ShipmentsService;
  let stocktakings: StocktakingsService;
  let stocks: StocksService;

  // 採番は対象外。伝票は prisma で直接作るため、この stub は確認経路では未使用。
  const docNoStub = {
    generateReceivingNo: async () => 'RCV-INT-0001',
    generateShipmentNo: async () => 'SHP-INT-0001',
    generateOrderNo: async () => 'PO-INT-001',
  } as never;

  let warehouseId: number;
  let supplierId: number;
  let productId: string;
  let categoryId: number;
  let userId: string;
  let seq = 0;

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    // 同時 tx が pool 待ちでなく行ロックで競合するよう connection_limit を上げる
    // （絞ると「pool が直列化しただけ」になり FOR UPDATE の証明にならない）。
    const url = `${db.databaseUrl}?connection_limit=30`;
    prisma = new PrismaService({ datasourceUrl: url });
    await prisma.$connect();
    stocks = new StocksService(new StocksRepository(prisma));
    receivingsRepo = new ReceivingsRepository(prisma);
    receivings = new ReceivingsService(receivingsRepo, docNoStub, stocks);
    shipments = new ShipmentsService(new ShipmentsRepository(prisma), docNoStub, stocks);
    stocktakings = new StocktakingsService(new StocktakingsRepository(prisma), stocks);
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  beforeEach(async () => {
    // 子 → 親 の順で全削除（FK 制約順）
    await prisma.stockAdjustment.deleteMany();
    await prisma.stock.deleteMany();
    await prisma.receivingLine.deleteMany();
    await prisma.receiving.deleteMany();
    await prisma.shipmentLine.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.stocktakingItem.deleteMany();
    await prisma.stocktaking.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.carrier.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { name: 'int-tester', email: 'int@test.local' },
    });
    userId = user.id;
    const category = await prisma.category.create({
      data: { code: 'INT-CAT', name: '統合テスト分類' },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { code: 'INT-PROD', name: '統合テスト商品', categoryId: category.id, price: 100 },
    });
    productId = product.id;
    const warehouse = await prisma.warehouse.create({
      data: { code: 'INT-WH', name: '統合テスト倉庫' },
    });
    warehouseId = warehouse.id;
    const supplier = await prisma.supplier.create({
      data: { code: 'INT-SUP', name: '統合テスト仕入先' },
    });
    supplierId = supplier.id;
  });

  function nextNo(prefix: string) {
    seq += 1;
    return `${prefix}-INT-${String(seq).padStart(4, '0')}`;
  }

  function createDraftReceiving(plannedQty: number) {
    return prisma.receiving.create({
      data: {
        receivingNo: nextNo('RCV'),
        receivingDate: new Date('2026-10-15'),
        warehouseId,
        supplierId,
        createdBy: userId,
        lines: { create: [{ lineNo: 1, productId, plannedQty }] },
      },
    });
  }

  /** 2 商品ぶんの明細を持つ入荷（productId 昇順のロック順を跨がせる）。 */
  async function createDraftReceivingTwoProducts(qtyA: number, qtyB: number) {
    const second = await prisma.product.create({
      data: { code: nextNo('INT-PROD2'), name: '統合テスト商品2', categoryId, price: 100 },
    });
    const receiving = await prisma.receiving.create({
      data: {
        receivingNo: nextNo('RCV2'),
        receivingDate: new Date('2026-10-15'),
        warehouseId,
        supplierId,
        createdBy: userId,
        lines: {
          create: [
            { lineNo: 1, productId, plannedQty: qtyA },
            { lineNo: 2, productId: second.id, plannedQty: qtyB },
          ],
        },
      },
    });
    return { receiving, secondProductId: second.id };
  }

  function createDraftShipment(plannedQty: number) {
    return prisma.shipment.create({
      data: {
        shipmentNo: nextNo('SHP'),
        shipmentDate: new Date('2026-10-15'),
        warehouseId,
        destination: '統合テスト配送先',
        createdBy: userId,
        lines: { create: [{ lineNo: 1, productId, plannedQty }] },
      },
    });
  }

  function createDraftStocktaking(actualQty: number | null) {
    return prisma.stocktaking.create({
      data: {
        stocktakingDate: new Date('2026-10-15'),
        warehouseId,
        stocktaker: '統合テスト担当',
        createdBy: userId,
        items: { create: [{ productId, theoreticalQty: 0, actualQty }] },
      },
    });
  }

  async function stockQuantity(): Promise<number> {
    const stock = await prisma.stock.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    return stock?.quantity ?? 0;
  }

  /** stock 行そのものの有無（lockStockForUpdate が ensure-row で作る空行を区別する）。 */
  async function stockRowExists(forProductId = productId): Promise<boolean> {
    const rows = await prisma.stock.findMany({
      where: { warehouseId, productId: forProductId },
      select: { id: true },
    });
    return rows.length > 0;
  }

  function adjustmentCount() {
    return prisma.stockAdjustment.count({ where: { warehouseId, productId } });
  }

  it('同一入荷の並行 confirm は 1 回だけ加算し、敗者は業務エラーで弾かれる', async () => {
    const receiving = await createDraftReceiving(10);

    const results = await Promise.allSettled([
      receivings.confirm(receiving.id, userId),
      receivings.confirm(receiving.id, userId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);

    // 二重計上していれば 20 になる
    expect(await stockQuantity()).toBe(10);
    expect(await adjustmentCount()).toBe(1);
    const after = await prisma.receiving.findUniqueOrThrow({ where: { id: receiving.id } });
    expect(after.status).toBe('CONFIRMED');
  });

  it('同一出荷の並行 confirm は 1 回だけ減算する', async () => {
    await prisma.stock.create({ data: { warehouseId, productId, quantity: 100 } });
    const shipment = await createDraftShipment(10);

    const results = await Promise.allSettled([
      shipments.confirm(shipment.id, userId),
      shipments.confirm(shipment.id, userId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // 二重減算していれば 80 になる
    expect(await stockQuantity()).toBe(90);
    expect(await adjustmentCount()).toBe(1);
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(after.status).toBe('CONFIRMED');
  });

  it('同一棚卸の並行 confirm は 1 回だけ上書きする', async () => {
    await prisma.stock.create({ data: { warehouseId, productId, quantity: 50 } });
    const stocktaking = await createDraftStocktaking(42);

    const results = await Promise.allSettled([
      stocktakings.confirm(stocktaking.id, userId),
      stocktakings.confirm(stocktaking.id, userId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await stockQuantity()).toBe(42);
    expect(await adjustmentCount()).toBe(1);
    const after = await prisma.stocktaking.findUniqueOrThrow({ where: { id: stocktaking.id } });
    expect(after.status).toBe('CONFIRMED');
  });

  it('異なる入荷を同一商品へ並行 confirm しても両方成功し、lost update なく合算される', async () => {
    const r1 = await createDraftReceiving(5);
    const r2 = await createDraftReceiving(7);

    const results = await Promise.allSettled([
      receivings.confirm(r1.id, userId),
      receivings.confirm(r2.id, userId),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await stockQuantity()).toBe(12);
    expect(await adjustmentCount()).toBe(2);
  });

  it('同一入荷（確定済み）の並行取消は 1 回だけ逆計上する', async () => {
    const receiving = await createDraftReceiving(10);
    await receivings.confirm(receiving.id, userId);
    expect(await stockQuantity()).toBe(10);

    const results = await Promise.allSettled([
      receivings.remove(receiving.id, userId),
      receivings.remove(receiving.id, userId),
    ]);

    // 取消が 2 回在庫へ効けば 10 を超えて戻る（-10）。確定の加算 1 + 逆計上 1 = 2 件で止まる。
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockQuantity()).toBe(0);
    expect(await adjustmentCount()).toBe(2);
  });

  it('敗者を長く待たせても、敗者は業務エラー（400系）で弾かれ 503 にならない', async () => {
    // C1 は「2 件目が在庫を重複計上せず既存の業務エラー（BadRequestException）になる」を要求する。
    // 文書ロックの保持が Prisma interactive tx の既定 timeout 5 秒を超えると、敗者は
    // PrismaClientKnownRequestError P2028 になり、例外フィルタが 503 へ写す（実測）。
    // runInTransaction の timeout 明示（60 秒）が効いていれば、敗者はロック解放後に DRAFT 判定へ
    // 落ちて BadRequestException（400 系）になる。ここはその境界を実測で固定する。
    const receiving = await createDraftReceiving(10);

    const stocksRepo = new StocksRepository(prisma);
    const real = stocksRepo.lockStockForUpdate.bind(stocksRepo);
    let calls = 0;
    const spy = jest.spyOn(stocksRepo, 'lockStockForUpdate') as unknown as {
      mockImplementation: (fn: (...args: never[]) => unknown) => void;
    };
    spy.mockImplementation(((...args: never[]) => {
      calls += 1;
      // 1 件目（先行して文書ロックを取った側）だけ在庫ロックを 6 秒保持する。
      if (calls === 1) {
        return new Promise((resolve) => {
          setTimeout(() => resolve(real(...(args as unknown as Parameters<typeof real>))), 6000);
        });
      }
      return real(...(args as unknown as Parameters<typeof real>));
    }) as never);
    const stocks = new StocksService(stocksRepo);
    const svc = new ReceivingsService(receivingsRepo, docNoStub, stocks);

    const results = await Promise.allSettled([
      svc.confirm(receiving.id, userId),
      svc.confirm(receiving.id, userId),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // 敗者は業務エラー（400 系）。P2028（503 へ写る）ではない。
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(String(rejected[0].reason?.code ?? '')).not.toBe('P2028');
    // 在庫は 1 回分だけ。
    expect(await stockQuantity()).toBe(10);
    expect(await adjustmentCount()).toBe(1);
  }, 60000);

  it('同一入荷の並行 confirm と update は直列化し、確定済みを DRAFT として書き換えない', async () => {
    const receiving = await createDraftReceiving(10);

    const results = await Promise.allSettled([
      receivings.confirm(receiving.id, userId),
      receivings.update(receiving.id, {
        lines: [{ lineNo: 1, productId, plannedQty: 99 }],
      } as never),
    ]);

    // ロック外で status を読んでいた旧実装では、update が DRAFT と誤認したまま confirm が
    // 確定し、その後に update が確定済み伝票の明細を書き換え得る（在庫は 10 のまま明細は 99）。
    // ロック後の最新 status で判定するため、勝敗にかかわらず「明細の数量」と「計上された在庫」が
    // 必ず一致する（update が先に勝てば 99 を計上、confirm が先に勝てば update は業務エラー）。
    const after = await prisma.receiving.findUniqueOrThrow({
      where: { id: receiving.id },
      include: { lines: true },
    });
    expect(after.status).toBe('CONFIRMED');
    expect(after.lines).toHaveLength(1);
    expect(await stockQuantity()).toBe(after.lines[0].plannedQty);
    expect(await adjustmentCount()).toBe(1);
    // update が負けた時だけ業務エラーになる（勝った時は DRAFT のまま置換しただけ）。
    const updateFailed = results[1].status === 'rejected';
    if (updateFailed) {
      expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
      expect(after.lines[0].plannedQty).toBe(10);
    }
    // confirm はどちらの順序でも成功する。
    expect(results[0].status).toBe('fulfilled');
  });

  it('同一入荷の並行 confirm と remove は直列化し、在庫を二重に動かさない', async () => {
    const receiving = await createDraftReceiving(10);

    const results = await Promise.allSettled([
      receivings.confirm(receiving.id, userId),
      receivings.remove(receiving.id, userId),
    ]);

    // 旧実装は tx 外で status を読み、remove が DRAFT と誤認して在庫を戻さず削除し得た。
    // その時 confirm の +10 だけが残り「伝票は消えたのに在庫が +10」になる（在庫10・監査1）。
    // ロック後の最新 status で判定するため、その組み合わせは起こらない。
    const stock = await stockQuantity();
    const adjustments = await adjustmentCount();
    const after = await prisma.receiving.findUniqueOrThrow({ where: { id: receiving.id } });
    expect(after.deletedAt).not.toBeNull();
    // 送達順で結果は変わるが、「消えた伝票の在庫が元へ戻っている」ことは順序に依らない。
    expect(stock).toBe(0);
    expect(adjustments).toBe(results[0].status === 'fulfilled' ? 2 : 0);
    // 旧実装が生み得た「在庫 +10 / 監査 1 件」の組み合わせを明示的に排除する。
    expect(`${stock}/${adjustments}`).not.toBe('10/1');
    if (results[0].status === 'rejected') {
      // remove が先に勝った: confirm は対象を失い業務エラーになる。
      expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(NotFoundException);
    }
  });

  it('確定の在庫計上が途中で失敗すると、先行した計上ぶんも含めて巻き戻る', async () => {
    // 2 明細にして、**1 本目の計上を成功させてから**2 本目で失敗させる。1 本目で失敗させると
    // 成功した書込みが 0 件になり、「在庫 0・監査 0・DRAFT」が tx の有無にかかわらず自明に
    // 成立してしまう（実測: runInTransaction を tx 無しへ変異させても検出できなかった）。
    // 先行計上を残すことで、tx が無ければ在庫と監査が残る＝検出力が生まれる。
    const { receiving, secondProductId } = await createDraftReceivingTwoProducts(7, 5);

    const stocksRepo = new StocksRepository(prisma);
    const real = stocksRepo.upsertStockIncrement.bind(stocksRepo);
    let calls = 0;
    const spy = jest.spyOn(stocksRepo, 'upsertStockIncrement') as unknown as {
      mockImplementation: (fn: (...args: never[]) => unknown) => void;
    };
    spy.mockImplementation(((...args: never[]) => {
      calls += 1;
      // 2 本目（productId 昇順の後ろ側）で落とす。1 本目は実書込みを通す。
      if (calls === 2) throw new Error('injected stock failure');
      return real(...(args as unknown as Parameters<typeof real>));
    }) as never);
    const stocks = new StocksService(stocksRepo);
    const svc = new ReceivingsService(receivingsRepo, docNoStub, stocks);

    await expect(svc.confirm(receiving.id, userId)).rejects.toThrow('injected stock failure');

    // 1 本目の計上が成功していても、tx が閉じていれば在庫・監査・状態のどれも残らない。
    expect(calls).toBe(2);
    expect(await stockQuantity()).toBe(0);
    expect(await adjustmentCount()).toBe(0);
    // lockStockForUpdate の ensure-row（quantity=0 の空行）も巻き戻る（stockQuantity の `?? 0`
    // では見えないため、行の存在そのものを見る）。
    expect(await stockRowExists()).toBe(false);
    expect(await stockRowExists(secondProductId)).toBe(false);
    const after = await prisma.receiving.findUniqueOrThrow({ where: { id: receiving.id } });
    expect(after.status).toBe('DRAFT');
  });
});
