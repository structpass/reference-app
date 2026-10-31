import { INestApplication } from '@nestjs/common';
import { AdjustmentType } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * e2e が開発 DB に残した行を消すための、接続クローズ込みの掃除の受け口。
 *
 * e2e は seed 済みの開発 DB に**本物の行**として書き込む（使い捨て DB ではない）。掃除を書かなかった
 * spec は、業務に見せる画面へ「E2Eテスト担当者」の棚卸や検証用倉庫を積み上げる。各 spec の
 * `afterAll` は、消す対象を決めて掃除し、**掃除が失敗しても接続は必ず閉じる**形で `runE2ECleanup` を呼ぶ。
 *
 * ## 在庫をどう扱うか
 *
 * 在庫（`stocks.quantity`）は伝票の状態から引き直せる値ではない。入荷・出荷の確定は在庫を**加減**
 * （`adjustStock`）、棚卸の確定は在庫を**上書き**（`overwriteStock`）する。なので「伝票だけ消す」と
 * 在庫がずれ、逆に「在庫を伝票から計算し直す」と上書きの結果を失う。
 *
 * 取るのは **試験を始めた時点の在庫を控えて、終わったら控えた値へ戻す** 方式にする
 * （{@link snapshotStocks} / {@link restoreStocks}）。試験が在庫へ与えた変化だけが戻り、試験の外で
 * 決まった在庫（seed の値・他の作業の値）はそのまま残る。
 *
 * ## 消す対象の決め方
 *
 * - {@link cleanupCreatedDocuments}: その spec が作った伝票（入荷・出荷・棚卸・発注）を**状態を問わず**
 *   id で消す。アプリの削除の口は DRAFT しか許さないが、状態を進めた行を残すと一覧に積み上がる
 *   （実測: 掃除を DRAFT だけにしたら、1 回流すたびに入荷・出荷・発注が数行ずつ増え続けた）
 * - {@link deleteCreatedMasters}: その spec が作った仕入先・倉庫・分類を、参照する伝票ごと id で消す
 * - spec の中で直接消す（ユーザーなど、参照を持たない行）
 *
 * 消すのは spec が控えた id だけで、**他人の行は対象にしない**（接頭辞で消すと、同時に走った別の回の
 * 行まで巻き込む）。
 *
 * ## 既知の限界（同時に走る別の回を完全には守れない）
 *
 * 複数の回が同じ開発 DB で同時に e2e を流すと、次の2つの窓が残る。`maxWorkers: 1` と spec の
 * 実行時間の短さで実際に起きる頻度は低いが、「防げている」とは言わない。
 *
 * 1. **在庫調整の記録を伴わない在庫の変更**は {@link restoreStocks} が検知できない（控えと戻しの間に
 *    その行の調整記録が無ければ「自分が動かした行」とみなす）。`stocks.quantity` を直接書く経路
 *    （seed の再実行・直接の UPDATE）は記録が残らないため、巻き戻す可能性がある。
 * 2. **控えに無い在庫行**（試験中に新しく作られた倉庫×商品）は「自分が作った行」とみなして消す。
 *    別の回が同時に作った行も同じ扱いになる。
 *
 * どちらも、同じ開発 DB を複数の回で同時に使う運用そのものが原因なので、並行実行をやめれば生じない。
 */
export async function runE2ECleanup(
  app: INestApplication,
  cleanup: () => Promise<void>,
): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    // まだ他の spec が DB を書いている最中だと、参照の確認と削除の間に外部キー違反が出る
    // （毎回ではなく、複数 spec を 1 回に流した時だけ起きる）。1 回だけ引き直す。
    if (!isForeignKeyViolation(error)) throw error;
    await cleanup();
  } finally {
    await app.close();
  }
}

/** 削除が外部キー違反で止まったか（Prisma の P2003）。 */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2003'
  );
}

/** 棚卸・入荷・出荷・発注の id（試験が作ったものを控える）。 */
export interface CreatedDocumentIds {
  receivingIds: number[];
  shipmentIds: number[];
  stocktakingIds: number[];
  orderIds: number[];
}

/** 空の {@link CreatedDocumentIds} を作る。 */
export function newCreatedDocumentIds(): CreatedDocumentIds {
  return { receivingIds: [], shipmentIds: [], stocktakingIds: [], orderIds: [] };
}

/** 在庫の控え（倉庫×商品ごとの数量と、控えた時刻）。 */
export interface StockSnapshot {
  quantities: Map<string, number>;
  /** 控えた時刻。これより後に在庫調整の記録がある行は「別の作業が動かした」として戻さない。 */
  takenAt: Date;
}

const stockKey = (warehouseId: number, productId: string) => `${warehouseId}|${productId}`;

/**
 * 試験を始める前に在庫を控える（`beforeAll` で呼ぶ）。
 *
 * 終わったら {@link restoreStocks} で控えた値へ戻す。これで、試験が入荷・出荷の確定や棚卸の確定で
 * 動かした在庫だけが戻る。
 */
export async function snapshotStocks(prisma: PrismaService): Promise<StockSnapshot> {
  const takenAt = new Date();
  const rows = await prisma.stock.findMany({
    select: { warehouseId: true, productId: true, quantity: true },
  });
  return {
    takenAt,
    quantities: new Map(rows.map((r) => [stockKey(r.warehouseId, r.productId), r.quantity])),
  };
}

/**
 * 在庫を控えた値へ戻す（`afterAll` で、伝票を消したあとに呼ぶ）。
 *
 * **触るのは控えた値と違う行だけ**で、控えた値のままの行には一切書き込まない。さらに「控えと
 * 戻しの間に、別の作業（別セッションの e2e・人の操作）が同じ行を動かした」場合にその値を巻き戻さない
 * よう、**その行の在庫調整の記録がすべて元の spec のもの（控えた時刻より前）である行だけ**を戻す。
 * 新しい記録が混ざっている行は、他人の変更を守るために触らない。
 *
 * 書き戻しは在庫調整の記録（`STOCKTAKING`）を1行残すので、後から「なぜ戻ったか」を追える。
 */
export async function restoreStocks(
  prisma: PrismaService,
  snapshot: StockSnapshot,
  createdBy: string,
): Promise<void> {
  const current = await prisma.stock.findMany({
    select: { id: true, warehouseId: true, productId: true, quantity: true },
  });

  const mismatched = current.filter(
    (row) => snapshot.quantities.get(stockKey(row.warehouseId, row.productId)) !== row.quantity,
  );
  if (mismatched.length === 0) return;

  // 戻しの対象になる行が、控えた時刻より後に別の作業で動かされていないかを、調整の記録で確かめる。
  const touched = await prisma.stockAdjustment.findMany({
    where: {
      OR: mismatched.map((row) => ({ warehouseId: row.warehouseId, productId: row.productId })),
      createdAt: { gte: snapshot.takenAt },
    },
    select: { warehouseId: true, productId: true },
  });
  const touchedElsewhere = new Set(touched.map((a) => stockKey(a.warehouseId, a.productId)));

  for (const row of mismatched) {
    const key = stockKey(row.warehouseId, row.productId);
    // 控えと戻しの間に別の作業が動かした行は、その値を守って触らない
    if (touchedElsewhere.has(key)) continue;

    const expected = snapshot.quantities.get(key);
    if (expected === undefined) {
      // 試験が新しく作った在庫は行ごと消す
      await prisma.stock.delete({ where: { id: row.id } });
      continue;
    }

    await prisma.stock.update({ where: { id: row.id }, data: { quantity: expected } });
    await prisma.stockAdjustment.create({
      data: {
        warehouseId: row.warehouseId,
        productId: row.productId,
        adjustmentType: AdjustmentType.STOCKTAKING,
        quantityBefore: row.quantity,
        quantityAfter: expected,
        reason: 'e2e の後始末: 試験前の在庫へ戻す',
        createdBy,
      },
    });
  }
}

/**
 * 伝票の確定で残った在庫調整の記録を消す（`restoreStocks` の前に呼ぶ）。
 *
 * 確定（入荷・出荷・棚卸）は在庫を動かすたびに調整の記録を残す。伝票を消しても記録は残るので、
 * 残したままだと **存在しない伝票番号を指す孤児行**が積み上がり、後から履歴を辿れなくなる。
 * 消すのは**この spec が作った伝票の番号を含む記録だけ**で、他人の記録は消さない。
 */
export async function deleteCreatedAdjustments(
  prisma: PrismaService,
  ids: CreatedDocumentIds,
): Promise<void> {
  const reasons: string[] = [];
  const numbers = await collectDocumentNumbers(prisma, ids);
  for (const no of numbers)
    reasons.push(`入荷確定: ${no}`, `入荷取消: ${no}`, `出荷確定: ${no}`, `出荷取消: ${no}`);
  if (reasons.length === 0) return;

  await prisma.stockAdjustment.deleteMany({ where: { reason: { in: reasons } } });
}

/** 削除する伝票の番号（入荷・出荷）を集める。棚卸の記録は id で引く。 */
async function collectDocumentNumbers(
  prisma: PrismaService,
  ids: CreatedDocumentIds,
): Promise<string[]> {
  const numbers: string[] = [];
  if (ids.receivingIds.length > 0) {
    const rows = await prisma.receiving.findMany({
      where: { id: { in: ids.receivingIds } },
      select: { receivingNo: true },
    });
    numbers.push(...rows.map((r) => r.receivingNo));
  }
  if (ids.shipmentIds.length > 0) {
    const rows = await prisma.shipment.findMany({
      where: { id: { in: ids.shipmentIds } },
      select: { shipmentNo: true },
    });
    numbers.push(...rows.map((r) => r.shipmentNo));
  }
  return numbers;
}

/** 棚卸の確定で残った在庫調整の記録を消す（`reason` が `棚卸確定: ID=<id>`）。 */
async function deleteCreatedStocktakingAdjustments(
  prisma: PrismaService,
  stocktakingIds: number[],
): Promise<void> {
  if (stocktakingIds.length === 0) return;
  await prisma.stockAdjustment.deleteMany({
    where: { reason: { in: stocktakingIds.map((id) => `棚卸確定: ID=${id}`) } },
  });
}

/**
 * その spec が作った伝票を、状態を問わず id で消す（消す順は在庫調整の記録 → 明細 → 伝票）。
 *
 * 在庫調整の記録は伝票番号でしか伝票と結び付かない（外部キーを持たない）ので、**伝票を消す前に**
 * 消す（消した後では番号を引けない）。
 */
export async function cleanupCreatedDocuments(
  prisma: PrismaService,
  ids: CreatedDocumentIds,
): Promise<void> {
  await deleteCreatedAdjustments(prisma, ids);
  await deleteCreatedStocktakingAdjustments(prisma, ids.stocktakingIds);
  await deleteCreatedStocktakings(prisma, ids.stocktakingIds);
  await deleteCreatedReceivings(prisma, ids.receivingIds);
  await deleteCreatedShipments(prisma, ids.shipmentIds);
  await deleteCreatedOrders(prisma, ids.orderIds);
}

/** 棚卸を id で消す（状態を問わない）。 */
export async function deleteCreatedStocktakings(
  prisma: PrismaService,
  stocktakingIds: number[],
): Promise<void> {
  if (stocktakingIds.length === 0) return;
  await prisma.stocktakingItem.deleteMany({ where: { stocktakingId: { in: stocktakingIds } } });
  await prisma.stocktaking.deleteMany({ where: { id: { in: stocktakingIds } } });
}

/** 入荷を id で消す（状態を問わない）。 */
export async function deleteCreatedReceivings(
  prisma: PrismaService,
  receivingIds: number[],
): Promise<void> {
  if (receivingIds.length === 0) return;
  await prisma.receivingLine.deleteMany({ where: { receivingId: { in: receivingIds } } });
  await prisma.receiving.deleteMany({ where: { id: { in: receivingIds } } });
}

/** 出荷を id で消す（状態を問わない）。 */
export async function deleteCreatedShipments(
  prisma: PrismaService,
  shipmentIds: number[],
): Promise<void> {
  if (shipmentIds.length === 0) return;
  await prisma.shipmentLine.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
  await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
}

/** 発注を id で消す（状態を問わない）。 */
export async function deleteCreatedOrders(
  prisma: PrismaService,
  orderIds: number[],
): Promise<void> {
  if (orderIds.length === 0) return;
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

/**
 * その spec が作った仕入先・倉庫・分類を id で消す（作成の試験が作るマスタ）。
 *
 * マスタは伝票から参照される（order / receiving は仕入先、receiving / shipment / stocks / 棚卸は倉庫）。
 * 参照が残っていると **外部キー違反で掃除が途中で止まり、他の行まで残る**（実測: 仕入先の掃除が止まり、
 * その spec が作った倉庫・分類・仕入先が積み上がった）。先に伝票を消し、そのあとマスタを消す。
 */
export async function deleteCreatedMasters(
  prisma: PrismaService,
  masters: { supplierIds?: number[]; warehouseIds?: number[]; categoryIds?: number[] },
): Promise<void> {
  const supplierIds = masters.supplierIds ?? [];
  const warehouseIds = masters.warehouseIds ?? [];
  const categoryIds = masters.categoryIds ?? [];

  if (supplierIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { supplierId: { in: supplierIds } },
      select: { id: true },
    });
    await deleteCreatedOrders(
      prisma,
      orders.map((r) => r.id),
    );
    const receivings = await prisma.receiving.findMany({
      where: { supplierId: { in: supplierIds } },
      select: { id: true },
    });
    await deleteCreatedReceivings(
      prisma,
      receivings.map((r) => r.id),
    );
  }

  if (warehouseIds.length > 0) {
    const receivings = await prisma.receiving.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { id: true },
    });
    await deleteCreatedReceivings(
      prisma,
      receivings.map((r) => r.id),
    );
    const shipments = await prisma.shipment.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { id: true },
    });
    await deleteCreatedShipments(
      prisma,
      shipments.map((r) => r.id),
    );
    const stocktakings = await prisma.stocktaking.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { id: true },
    });
    await deleteCreatedStocktakings(
      prisma,
      stocktakings.map((r) => r.id),
    );
    await prisma.stockAdjustment.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
    await prisma.stock.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
  }

  if (categoryIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { categoryId: { in: categoryIds } },
      select: { id: true },
    });
    const productIds = products.map((r) => r.id);
    if (productIds.length > 0) {
      await prisma.stocktakingItem.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.receivingLine.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.shipmentLine.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.orderItem.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.stockAdjustment.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.stock.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  }
}
