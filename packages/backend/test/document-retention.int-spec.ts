import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '@/database/prisma.service';
import { OrdersRepository } from '@/modules/orders/repositories/orders.repository';
import { OrdersService } from '@/modules/orders/orders.service';
import { StocktakingsRepository } from '@/modules/stocktakings/repositories/stocktakings.repository';
import { StocktakingsService } from '@/modules/stocktakings/stocktakings.service';
import { StocksRepository } from '@/modules/stocks/repositories/stocks.repository';
import { StocksService } from '@/modules/stocks/stocks.service';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

describe('伝票・明細の保持と発注の状態競合 (d629)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;
  let ordersRepo: OrdersRepository;
  let orders: OrdersService;
  let stocktakings: StocktakingsService;
  let productId: string;
  let warehouseId: number;
  let supplierId: number;
  let userId: string;
  let sequence = 0;
  const parentKeys = [
    ['receiving_lines', 'receiving_id', 'receivings'],
    ['shipment_lines', 'shipment_id', 'shipments'],
    ['stocktaking_items', 'stocktaking_id', 'stocktakings'],
    ['order_items', 'order_id', 'orders'],
  ] as const;

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    prisma = new PrismaService({ datasourceUrl: `${db.databaseUrl}?connection_limit=10` });
    await prisma.$connect();
    ordersRepo = new OrdersRepository(prisma);
    orders = new OrdersService(ordersRepo, {} as never);
    stocktakings = new StocktakingsService(
      new StocktakingsRepository(prisma),
      new StocksService(new StocksRepository(prisma)),
    );
    userId = (
      await prisma.user.create({ data: { name: 'retention', email: 'retention@test.local' } })
    ).id;
    const category = await prisma.category.create({ data: { code: 'RET', name: '保持試験' } });
    productId = (
      await prisma.product.create({
        data: { code: 'RET', name: '保持試験', categoryId: category.id, price: 100 },
      })
    ).id;
    warehouseId = (await prisma.warehouse.create({ data: { code: 'RET', name: '保持試験' } })).id;
    supplierId = (await prisma.supplier.create({ data: { code: 'RET', name: '保持試験' } })).id;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });
  afterEach(() => jest.restoreAllMocks());

  const createOrder = () =>
    prisma.order.create({
      data: {
        orderNo: `RET-${++sequence}`,
        orderDate: new Date('2026-10-21'),
        supplierId,
        createdBy: userId,
        totalQty: 2,
        totalAmount: 200,
        items: { create: [{ lineNo: 1, productId, orderQty: 2, unitPrice: 100, amount: 200 }] },
      },
    });
  const createStocktaking = () =>
    prisma.stocktaking.create({
      data: {
        stocktakingDate: new Date('2026-10-21'),
        warehouseId,
        createdBy: userId,
        items: { create: [{ productId, theoreticalQty: 0, actualQty: 2 }] },
      },
    });

  it('既存明細を保持して4外部キーをCASCADEからRESTRICTへ移行する', async () => {
    const receiving = await prisma.receiving.create({
      data: {
        receivingNo: 'RET',
        receivingDate: new Date('2026-10-21'),
        warehouseId,
        supplierId,
        createdBy: userId,
        lines: { create: [{ lineNo: 1, productId, plannedQty: 2 }] },
      },
    });
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNo: 'RET',
        shipmentDate: new Date('2026-10-21'),
        warehouseId,
        destination: '試験',
        createdBy: userId,
        lines: { create: [{ lineNo: 1, productId, plannedQty: 2 }] },
      },
    });
    const stocktaking = await createStocktaking();
    const order = await createOrder();
    const before = await Promise.all(
      parentKeys.map(([table]) => prisma.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY id`)),
    );
    // 実際の旧FKへ戻してからmigrationを適用し、既存行を含むupgradeを検証する。
    for (const [table, column, parent] of parentKeys) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${table}_${column}_fkey"`,
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fkey" FOREIGN KEY ("${column}") REFERENCES "${parent}"(id) ON DELETE CASCADE ON UPDATE CASCADE`,
      );
    }
    // 開発DBの欠落も再現する。正常な2本はそのまま、欠けた2本だけ復旧する。
    for (const [table] of parentKeys.slice(0, 2)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${table}_product_id_fkey"`,
      );
    }
    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20261021150000_restrict_document_line_parents/migration.sql',
      ),
      'utf8',
    );
    const applied = await db.container.exec([
      'psql',
      '-U',
      db.container.getUsername(),
      '-d',
      db.container.getDatabase(),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      migration,
    ]);
    expect(applied.exitCode).toBe(0);
    expect(
      await Promise.all(
        parentKeys.map(([table]) => prisma.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY id`)),
      ),
    ).toEqual(before);
    for (const [table, column] of parentKeys) {
      const constraints = await prisma.$queryRaw<{ confdeltype: string; convalidated: boolean }[]>`
        SELECT confdeltype::text, convalidated FROM pg_constraint WHERE conname = ${`${table}_${column}_fkey`}
      `;
      expect(constraints).toEqual([{ confdeltype: 'r', convalidated: true }]);
      const productConstraints = await prisma.$queryRaw<
        { confdeltype: string; convalidated: boolean }[]
      >`
        SELECT confdeltype::text, convalidated FROM pg_constraint WHERE conname = ${`${table}_product_id_fkey`}
      `;
      expect(productConstraints).toEqual([{ confdeltype: 'r', convalidated: true }]);
    }
    const targets = [receiving.id, shipment.id, stocktaking.id, order.id];
    for (let i = 0; i < parentKeys.length; i++) {
      const [, , parent] = parentKeys[i];
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "${parent}" WHERE id = $1`, targets[i]),
      ).rejects.toThrow();
    }
    expect(
      await Promise.all(
        parentKeys.map(([table]) => prisma.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY id`)),
      ),
    ).toEqual(before);
    await expect(prisma.product.delete({ where: { id: productId } })).rejects.toMatchObject({
      code: 'P2003',
    });
    // 論理削除済み伝票の明細は履歴であり、親不在ではない。
    await orders.remove(order.id);
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({
      deletedAt: expect.any(Date),
    });
  });

  it('下書き棚卸は子と親を削除し、確定棚卸の更新・削除は明細を保持して拒否する', async () => {
    const draft = await createStocktaking();
    await stocktakings.remove(draft.id);
    expect(await prisma.stocktaking.findUnique({ where: { id: draft.id } })).toBeNull();
    expect(await prisma.stocktakingItem.count({ where: { stocktakingId: draft.id } })).toBe(0);
    const confirmed = await createStocktaking();
    await stocktakings.confirm(confirmed.id, userId);
    const before = await prisma.stocktakingItem.findMany({
      where: { stocktakingId: confirmed.id },
    });
    await expect(stocktakings.remove(confirmed.id)).rejects.toBeInstanceOf(BadRequestException);
    await expect(stocktakings.update(confirmed.id, { items: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(
      await prisma.stocktakingItem.findMany({ where: { stocktakingId: confirmed.id } }),
    ).toEqual(before);
    expect(
      await prisma.stock.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } },
      }),
    ).toMatchObject({ quantity: 2 });
  });

  it('棚卸の親削除に失敗した場合は明細削除もロールバックする', async () => {
    const draft = await createStocktaking();
    const repo = new StocktakingsRepository(prisma);
    const service = new StocktakingsService(repo, {} as never);
    jest.spyOn(repo, 'deleteInTx').mockRejectedValueOnce(new Error('delete failed'));
    await expect(service.remove(draft.id)).rejects.toThrow('delete failed');
    expect(await prisma.stocktakingItem.count({ where: { stocktakingId: draft.id } })).toBe(1);
  });

  const update = (id: number) =>
    orders.update(id, { items: [{ lineNo: 1, productId, orderQty: 7, unitPrice: 100 }] });
  type Action = 'confirm' | 'update' | 'remove';
  const act = (action: Action, id: number) =>
    action === 'update' ? update(id) : orders[action](id);
  it.each<[Action, Action, number, boolean, boolean]>([
    ['confirm', 'update', 2, false, true],
    ['update', 'confirm', 7, false, false],
    ['remove', 'confirm', 2, true, true],
    ['remove', 'update', 2, true, true],
    ['confirm', 'remove', 2, true, false],
    ['confirm', 'confirm', 2, false, true],
  ])(
    '%s先勝ち/%s後続でも確定済み明細と削除済み状態を守る',
    async (first, second, qty, deleted, rejectSecond) => {
      const order = await createOrder();
      let signalLocked!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const realLock = ordersRepo.lockByIdInTx.bind(ordersRepo);
      jest
        .spyOn(ordersRepo, 'lockByIdInTx')
        .mockImplementationOnce(async (tx: Prisma.TransactionClient, id: number) => {
          const result = await realLock(tx, id);
          signalLocked();
          await gate;
          return result;
        });
      const winner = act(first, order.id);
      await locked;
      const follower = act(second, order.id).then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      );
      try {
        // pool待ちではなく実際に伝票行のロックで後続が待機することを確認する。
        let waiting = false;
        for (let i = 0; i < 100 && !waiting; i++) {
          const rows = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database()
          AND wait_event_type = 'Lock' AND query LIKE '%orders%'
        `;
          waiting = rows[0].n > 0n;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
      } finally {
        release();
      }
      await winner;
      const result = await follower;
      if (rejectSecond)
        expect(result.error).toBeInstanceOf(
          first === 'remove' ? NotFoundException : BadRequestException,
        );
      else expect(result.error).toBeNull();
      const final = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      expect(final.items).toHaveLength(1);
      expect(final.items[0].orderQty).toBe(qty);
      expect(final.totalQty).toBe(qty);
      expect(final.totalAmount?.toNumber()).toBe(qty * 100);
      expect(final.deletedAt !== null).toBe(deleted);
      expect(final.status).toBe(first === 'remove' ? 'DRAFT' : 'ORDERED');
    },
  );
});
