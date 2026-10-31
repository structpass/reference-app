import { AdjustmentType, ReceivingStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { StocksRepository } from '@/modules/stocks/repositories/stocks.repository';
import { StocksService } from '@/modules/stocks/stocks.service';
import { ReceivingsRepository } from '@/modules/receivings/repositories/receivings.repository';
import { ReceivingsService } from '@/modules/receivings/receivings.service';
import { ShipmentsRepository } from '@/modules/shipments/repositories/shipments.repository';
import { ShipmentsService } from '@/modules/shipments/shipments.service';
import { effectiveQty } from '@/common/helpers';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * v2-515: 実績数（actualQty）を省略して確定した入荷・出荷を **取り消した時に在庫が
 * 元の数へ戻る**ことを、実 PostgreSQL 上で確かめる。
 *
 * ## 何を固定するか
 *
 * 確定（confirm）は有効数量を `actualQty ?? plannedQty` で決めるが、取消（remove）は
 * `actualQty > 0` の時だけ逆計上していた。したがって `plannedQty=5 / actualQty=null` の
 * 伝票は、確定で在庫が ±5 動いたのに取消で 0 しか戻らず、在庫がずれたまま残る。
 * actualQty は schema 上も nullable・DTO 上も任意項目なので、この状態は実際に到達する。
 *
 * ここではモックではなく実 DB に対して create → confirm → remove を通し、
 *
 *   1. 在庫が確定前の数へ戻ること（null / 省略 / 明示 0 / 正数の4通り）
 *   2. 在庫調整履歴（stock_adjustments）が確定と取消で同じ数量の逆符号になり、
 *      前後数量も逆順になること（quantityBefore / quantityAfter の対称性）
 *   3. 取消の transaction が失敗した時に在庫が動かないこと（rollback）
 *   4. 取消済みの伝票をもう一度取り消しても在庫が二重に動かないこと（二重取消）
 *
 * を確かめる。モックの unit spec は「Service がどの delta を渡すか」を見るのに対し、
 * こちらは「実在庫行と監査行が最終的にどうなるか」を見る（射程が異なり相補的）。
 *
 * Docker 必須のため通常の `pnpm test` から分離（`pnpm test:int`）。
 */
describe('実績数を省略した入出荷の取消で在庫が戻る — 実DB統合 (v2-515)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;
  let receivings: ReceivingsService;
  let shipments: ShipmentsService;
  let receivingsRepo: ReceivingsRepository;
  let shipmentsRepo: ShipmentsRepository;

  let warehouseId: number;
  let supplierId: number;
  let userId: string;
  let productId: string;
  let carrierId: number | null;

  const getStock = async (): Promise<number> => {
    const stock = await prisma.stock.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    return stock?.quantity ?? 0;
  };

  const adjustments = () =>
    prisma.stockAdjustment.findMany({
      where: { warehouseId, productId },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    prisma = new PrismaService({ datasourceUrl: `${db.databaseUrl}?connection_limit=10` });
    await prisma.$connect();
    const stocksService = new StocksService(new StocksRepository(prisma));
    receivingsRepo = new ReceivingsRepository(prisma);
    shipmentsRepo = new ShipmentsRepository(prisma);
    receivings = new ReceivingsService(
      receivingsRepo,
      // 採番は本テストの対象外。固定値を返す差し替えで DB だけを本物にする。
      { generateReceivingNo: async () => `RCV-V2515-${Date.now()}-${Math.random()}` } as never,
      stocksService,
    );
    shipments = new ShipmentsService(
      shipmentsRepo,
      { generateShipmentNo: async () => `SHP-V2515-${Date.now()}-${Math.random()}` } as never,
      stocksService,
    );
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  beforeEach(async () => {
    // 子 → 親 の順（FK: line は document と product、adjustment は warehouse/product/user）
    await prisma.receivingLine.deleteMany();
    await prisma.shipmentLine.deleteMany();
    await prisma.receiving.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.stockAdjustment.deleteMany();
    await prisma.stock.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { name: 'v2-515 tester', email: `v2-515-${Date.now()}@struct-pass.example` },
    });
    userId = user.id;

    const category = await prisma.category.create({
      data: { code: `V2515-CAT-${Date.now()}`, name: 'v2-515 分類' },
    });
    const product = await prisma.product.create({
      data: {
        code: `V2515-PRD-${Date.now()}`,
        name: 'v2-515 商品',
        categoryId: category.id,
        price: 100,
      },
    });
    productId = product.id;

    const warehouse = await prisma.warehouse.create({
      data: { code: `V2515-WH-${Date.now()}`, name: 'v2-515 倉庫' },
    });
    warehouseId = warehouse.id;

    const supplier = await prisma.supplier.create({
      data: { code: `V2515-SUP-${Date.now()}`, name: 'v2-515 仕入先' },
    });
    supplierId = supplier.id;
    carrierId = null;
  });

  /** 入荷伝票を1件作る（DRAFT）。 */
  const createReceiving = async (lines: { plannedQty: number; actualQty?: number | null }[]) => {
    const res = await receivings.create(
      {
        receivingDate: '2026-10-15',
        warehouseId,
        supplierId,
        lines: lines.map((line, index) => ({
          lineNo: index + 1,
          productId,
          plannedQty: line.plannedQty,
          ...(line.actualQty === undefined ? {} : { actualQty: line.actualQty }),
        })),
      } as never,
      userId,
    );
    return res.data.id;
  };

  /** 出荷伝票を1件作る（DRAFT）。 */
  const createShipment = async (lines: { plannedQty: number; actualQty?: number | null }[]) => {
    const res = await shipments.create(
      {
        shipmentDate: '2026-10-15',
        warehouseId,
        destination: 'v2-515 出荷先',
        ...(carrierId ? { carrierId } : {}),
        lines: lines.map((line, index) => ({
          lineNo: index + 1,
          productId,
          plannedQty: line.plannedQty,
          ...(line.actualQty === undefined ? {} : { actualQty: line.actualQty }),
        })),
      } as never,
      userId,
    );
    return res.data.id;
  };

  /** 初期在庫を作る。 */
  const seedStock = (quantity: number) =>
    prisma.stock.create({ data: { warehouseId, productId, quantity } });

  // ==========================================================================
  // 受入条件1: actualQty 省略（null）で確定した入荷の取消で在庫が戻る
  // ==========================================================================
  describe('入荷（receivings）', () => {
    it('受入条件1: actualQty=null で確定した入荷の取消で在庫が確定前へ戻る', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 5, actualQty: null }]);

      await receivings.confirm(id, userId);
      expect(await getStock()).toBe(105); // 確定: plannedQty 5 を計上

      await receivings.remove(id, userId);
      expect(await getStock()).toBe(100); // 取消: 同じ 5 を戻す
    });

    it('受入条件1: actualQty を省略した入荷の取消でも在庫が戻る', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 7 }]);

      await receivings.confirm(id, userId);
      expect(await getStock()).toBe(107);

      await receivings.remove(id, userId);
      expect(await getStock()).toBe(100);
    });

    it('受入条件3: actualQty=0 の入荷は確定でも取消でも在庫を動かさない', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 5, actualQty: 0 }]);

      await receivings.confirm(id, userId);
      expect(await getStock()).toBe(100); // 0 を plannedQty 5 へ読み替えない

      await receivings.remove(id, userId);
      expect(await getStock()).toBe(100);
      expect(await adjustments()).toHaveLength(0); // 監査行も作られない
    });

    it('actualQty が正数の入荷は従来どおり実績数で往復する', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 10, actualQty: 3 }]);

      await receivings.confirm(id, userId);
      expect(await getStock()).toBe(103); // plannedQty ではなく actualQty

      await receivings.remove(id, userId);
      expect(await getStock()).toBe(100);
    });

    it('受入条件4: 確定と取消の監査履歴が同じ数量の逆符号で前後数量も逆順になる', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 5, actualQty: null }]);

      await receivings.confirm(id, userId);
      await receivings.remove(id, userId);

      const rows = await adjustments();
      expect(rows).toHaveLength(2);
      const [confirmed, cancelled] = rows;
      expect(confirmed.adjustmentType).toBe(AdjustmentType.RECEIVING);
      expect(cancelled.adjustmentType).toBe(AdjustmentType.RECEIVING);

      // 確定: 100 → 105 / 取消: 105 → 100（同じ数量の逆符号・前後が逆順）
      expect([confirmed.quantityBefore, confirmed.quantityAfter]).toEqual([100, 105]);
      expect([cancelled.quantityBefore, cancelled.quantityAfter]).toEqual([105, 100]);
      expect(cancelled.quantityAfter - cancelled.quantityBefore).toBe(
        -(confirmed.quantityAfter - confirmed.quantityBefore),
      );
      // 確定と取消が使った数量は effectiveQty と一致する（規則の一本化）
      expect(effectiveQty({ actualQty: null, plannedQty: 5 })).toBe(5);
    });

    it('伝票の状態は取消で CONFIRMED から削除（soft delete）へ移る', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 5, actualQty: null }]);
      await receivings.confirm(id, userId);
      await receivings.remove(id, userId);

      const row = await prisma.receiving.findFirst({ where: { id } });
      expect(row?.status).toBe(ReceivingStatus.CONFIRMED);
      expect(row?.deletedAt).not.toBeNull();
    });

    it('回帰の検出力: 変更前の規則なら在庫が戻らず監査行も1件しか出ない', async () => {
      // この票の回帰検出力は c1〜c4 のテストそのものが担う。取消が「在庫を確定前へ戻し、
      // 監査行を2件（確定と取消）残す」ことを要求しているので、実装を
      // `if (line.actualQty && line.actualQty > 0)` へ戻すと c1 は 100 にならず、
      // c4 は rows.length が 1 になって落ちる。
      //
      // ここではその弁別点を、変更前の式を実際の行へ当てて数値で示す（実装を呼ぶテストでは
      // ないので、これ自体は退行検出の証拠ではなく「何が欠けていたか」の記録である）。
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 5, actualQty: null }]);
      await receivings.confirm(id, userId);
      expect(await getStock()).toBe(105);

      const line = await prisma.receivingLine.findFirstOrThrow({ where: { receivingId: id } });
      // 変更前: `if (line.actualQty && line.actualQty > 0)` → null なので逆計上しない
      const oldReverseDelta = line.actualQty && line.actualQty > 0 ? -line.actualQty : 0;
      expect(oldReverseDelta).toBe(0); // 旧規則の逆計上は 0 件
      expect(await adjustments()).toHaveLength(1); // 監査行も確定の1件だけ
      expect(await getStock()).toBe(105); // ゆえに確定前の 100 へ戻らない

      // 現行規則は同じ行から -5 を出し、取消の監査行が増える（c4 が2件を要求する）
      expect(-effectiveQty(line)).toBe(-5);

      await receivings.remove(id, userId);
      expect(await getStock()).toBe(100);
      expect(await adjustments()).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 受入条件2: actualQty 省略（null）で確定した出荷の取消で在庫が戻る
  // ==========================================================================
  describe('出荷（shipments）', () => {
    it('受入条件2: actualQty=null で確定した出荷の取消で在庫が確定前へ戻る', async () => {
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 5, actualQty: null }]);

      await shipments.confirm(id, userId);
      expect(await getStock()).toBe(95); // 確定: plannedQty 5 を減算

      await shipments.remove(id, userId);
      expect(await getStock()).toBe(100); // 取消: 同じ 5 を戻す
    });

    it('受入条件2: actualQty を省略した出荷の取消でも在庫が戻る', async () => {
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 7 }]);

      await shipments.confirm(id, userId);
      expect(await getStock()).toBe(93);

      await shipments.remove(id, userId);
      expect(await getStock()).toBe(100);
    });

    it('受入条件3: actualQty=0 の出荷は確定でも取消でも在庫を動かさない', async () => {
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 5, actualQty: 0 }]);

      await shipments.confirm(id, userId);
      expect(await getStock()).toBe(100);

      await shipments.remove(id, userId);
      expect(await getStock()).toBe(100);
      expect(await adjustments()).toHaveLength(0);
    });

    it('actualQty が正数の出荷は従来どおり実績数で往復する', async () => {
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 10, actualQty: 3 }]);

      await shipments.confirm(id, userId);
      expect(await getStock()).toBe(97);

      await shipments.remove(id, userId);
      expect(await getStock()).toBe(100);
    });

    it('受入条件4: 確定と取消の監査履歴が同じ数量の逆符号で前後数量も逆順になる', async () => {
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 5, actualQty: null }]);

      await shipments.confirm(id, userId);
      await shipments.remove(id, userId);

      const rows = await adjustments();
      expect(rows).toHaveLength(2);
      const [confirmed, cancelled] = rows;
      expect(confirmed.adjustmentType).toBe(AdjustmentType.SHIPMENT);
      expect(cancelled.adjustmentType).toBe(AdjustmentType.SHIPMENT);

      // 確定: 100 → 95 / 取消: 95 → 100
      expect([confirmed.quantityBefore, confirmed.quantityAfter]).toEqual([100, 95]);
      expect([cancelled.quantityBefore, cancelled.quantityAfter]).toEqual([95, 100]);
      expect(cancelled.quantityAfter - cancelled.quantityBefore).toBe(
        -(confirmed.quantityAfter - confirmed.quantityBefore),
      );
    });

    it('複数行の取消も productId 昇順で在庫ロックを取ること（確定と同順）', async () => {
      // 同じ伝票に複数商品を載せ、確定と同じ固定順（productId 昇順）でロックを取ることを
      // 監査行の並びで確かめる。逆順だと並行 confirm とデッドロックし得る。
      const category = await prisma.category.findFirstOrThrow({ where: { id: { gt: 0 } } });
      const other = await prisma.product.create({
        data: {
          code: `V2515-B-${Date.now()}`,
          name: 'v2-515 商品B',
          categoryId: category.id,
          price: 100,
        },
      });
      // 'a...' < 'b...' になるよう productId を選ぶ（product.id は UUID なので大小は生成依存）
      const [low, high] = [productId, other.id].sort((a, b) => a.localeCompare(b));
      await prisma.stock.create({ data: { warehouseId, productId: low, quantity: 100 } });
      await prisma.stock.create({ data: { warehouseId, productId: high, quantity: 100 } });

      const created = await receivings.create(
        {
          receivingDate: '2026-10-15',
          warehouseId,
          supplierId,
          lines: [
            { lineNo: 1, productId: high, plannedQty: 2, actualQty: null },
            { lineNo: 2, productId: low, plannedQty: 3, actualQty: null },
          ],
        } as never,
        userId,
      );

      await receivings.confirm(created.data.id, userId);
      await receivings.remove(created.data.id, userId);

      const rows = await prisma.stockAdjustment.findMany({
        where: { warehouseId, productId: { in: [low, high] }, reason: { contains: '取消' } },
        orderBy: { id: 'asc' },
      });
      expect(rows.map((row) => row.productId)).toEqual([low, high]);
    });

    it('出荷の状態は確定で CONFIRMED のまま、取消で soft delete される', async () => {
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 5, actualQty: null }]);
      await shipments.confirm(id, userId);
      expect((await prisma.shipment.findFirst({ where: { id } }))?.status).toBe(
        ShipmentStatus.CONFIRMED,
      );

      await shipments.remove(id, userId);
      const row = await prisma.shipment.findFirst({ where: { id } });
      expect(row?.status).toBe(ShipmentStatus.CONFIRMED);
      expect(row?.deletedAt).not.toBeNull();
    });
  });

  // ==========================================================================
  // 受入条件5: rollback と二重取消
  // ==========================================================================
  describe('rollback と二重取消', () => {
    it('受入条件5: 取消 transaction が途中で失敗すると在庫も監査も動かない', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 5, actualQty: null }]);
      await receivings.confirm(id, userId);
      expect(await getStock()).toBe(105);
      const before = await adjustments();

      // tx 内の最後の DB 操作（soft delete）で失敗させる。在庫の逆計上は同じ
      // transaction の中で既に走っているため、rollback されなければ在庫が残る。
      const spy = jest
        .spyOn(receivingsRepo, 'softDeleteInTx')
        .mockRejectedValueOnce(new Error('v2-515 injected failure'));
      try {
        await expect(receivings.remove(id, userId)).rejects.toThrow('v2-515 injected failure');
      } finally {
        spy.mockRestore();
      }

      // rollback: 在庫は確定後の値のまま、監査行も増えない、削除もされない
      expect(await getStock()).toBe(105);
      expect(await adjustments()).toHaveLength(before.length);
      const row = await prisma.receiving.findFirst({ where: { id } });
      expect(row?.deletedAt).toBeNull();
    });

    it('受入条件5: 取消済みの伝票をもう一度取り消しても在庫が二重に動かない', async () => {
      await seedStock(100);
      const id = await createReceiving([{ plannedQty: 5, actualQty: null }]);
      await receivings.confirm(id, userId);
      await receivings.remove(id, userId);
      expect(await getStock()).toBe(100);

      // 2回目は notDeleted の絞り込みで見つからず、在庫に触れない（二重に戻さない）
      await expect(receivings.remove(id, userId)).rejects.toMatchObject({ status: 404 });
      expect(await getStock()).toBe(100);
      expect(await adjustments()).toHaveLength(2);
    });

    it('受入条件5: 出荷の取消 transaction も失敗時に在庫・監査・削除を動かさない', async () => {
      // 入荷と同じ構造を出荷でも固定する（rollback の射程を両モジュールへ広げる）。
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 5, actualQty: null }]);
      await shipments.confirm(id, userId);
      expect(await getStock()).toBe(95);
      const before = await adjustments();

      const spy = jest
        .spyOn(shipmentsRepo, 'softDeleteInTx')
        .mockRejectedValueOnce(new Error('v2-515 injected shipment failure'));
      try {
        await expect(shipments.remove(id, userId)).rejects.toThrow(
          'v2-515 injected shipment failure',
        );
      } finally {
        spy.mockRestore();
      }

      expect(await getStock()).toBe(95); // 逆計上 +5 は rollback されて残らない
      expect(await adjustments()).toHaveLength(before.length);
      const row = await prisma.shipment.findFirst({ where: { id } });
      expect(row?.deletedAt).toBeNull();
    });

    it('受入条件5: 出荷の取消済み伝票でも二重取消で在庫が動かない', async () => {
      await seedStock(100);
      const id = await createShipment([{ plannedQty: 5, actualQty: null }]);
      await shipments.confirm(id, userId);
      await shipments.remove(id, userId);
      expect(await getStock()).toBe(100);

      await expect(shipments.remove(id, userId)).rejects.toMatchObject({ status: 404 });
      expect(await getStock()).toBe(100);
      expect(await adjustments()).toHaveLength(2);
    });
  });
});
