import { Injectable } from '@nestjs/common';
import { Prisma, AdjustmentType, ReceivingStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindStocksDto } from '../dto/find-stocks.dto';
import { FindForecastDto } from '../dto/find-forecast.dto';
import { StockWithRelationsResponseDto, StockExportResponseDto } from '../dto/stock-response.dto';
import { toStockWithRelationsListResponse, toStockExportListResponse } from '../stocks.mapper';
import { buildPaginatedMeta, okPaginated, PaginatedResponse } from '../../../common/dto';
import { notDeleted } from '../../../common/helpers';

const STOCK_INCLUDE = {
  warehouse: { select: { id: true, name: true, code: true } },
  product: {
    select: {
      id: true,
      name: true,
      code: true,
      unit: true,
      category: { select: { id: true, name: true } },
    },
  },
} as const;

const STOCK_EXPORT_INCLUDE = {
  warehouse: { select: { name: true, code: true } },
  product: {
    select: {
      name: true,
      code: true,
      unit: true,
      category: { select: { name: true } },
    },
  },
} as const;

const ALLOWED_SORT_FIELDS = ['id', 'quantity', 'warehouseId'] as const;

function buildWhere(query: FindStocksDto): Prisma.StockWhereInput {
  const where: Prisma.StockWhereInput = {};

  if (query.warehouseId) {
    where.warehouseId = query.warehouseId;
  }

  if (query.category) {
    where.product = {
      ...((where.product as Prisma.ProductWhereInput) ?? {}),
      category: { name: query.category },
    };
  }

  if (query.search) {
    where.product = {
      ...((where.product as Prisma.ProductWhereInput) ?? {}),
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }

  return where;
}

function buildForecastWhere(query: FindForecastDto): Prisma.StockWhereInput {
  const where: Prisma.StockWhereInput = {};
  if (query.warehouseId) {
    where.warehouseId = query.warehouseId;
  }
  if (query.search) {
    where.product = {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }
  return where;
}

function resolveSort(sort: string | undefined): string {
  if (!sort) return 'id';
  return (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'id';
}

@Injectable()
export class StocksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findManyPaginated(
    query: FindStocksDto,
  ): Promise<PaginatedResponse<StockWithRelationsResponseDto>> {
    const { page = 1, limit = 20, order = 'asc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.stock.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortField]: order },
        include: STOCK_INCLUDE,
      }),
      this.prisma.stock.count({ where }),
    ]);

    return okPaginated(
      toStockWithRelationsListResponse(data),
      buildPaginatedMeta(total, page, limit),
    );
  }

  async findManyForExport(query: FindStocksDto): Promise<StockExportResponseDto[]> {
    const where = buildWhere(query);

    const data = await this.prisma.stock.findMany({
      where,
      orderBy: { id: 'asc' },
      include: STOCK_EXPORT_INCLUDE,
    });
    return toStockExportListResponse(data);
  }

  async findManyForForecast(query: FindForecastDto) {
    const { page = 1, limit = 20 } = query;
    const where = buildForecastWhere(query);

    const [stocks, total] = await Promise.all([
      this.prisma.stock.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
        include: STOCK_INCLUDE,
      }),
      this.prisma.stock.count({ where }),
    ]);

    return { stocks, total, page, limit };
  }

  async lockStockForUpdate(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    productId: string,
  ): Promise<{ quantity: number }[]> {
    // CODE-H3: SELECT ... FOR UPDATE は「存在しない行」をロックできない。
    // 初回入荷など stock 行が未作成の (warehouse, product) では行ロックが取得できず、
    // 同時実行が直列化されないため StockAdjustment の before/after 監査値が壊れる。
    // 先に空行(quantity=0)を冪等に確保してから FOR UPDATE することで、行の有無に
    // かかわらず必ずロック対象を得る。
    //
    // ON CONFLICT DO UPDATE は SET が値の no-op でも競合行に行ロックを取得する。
    // よって同時初回入荷は 2 つ目の INSERT が競合でブロックし直列化される。
    // ここを Prisma の upsert({ update: {} }) で書くこともできるが、空 update が
    // 将来 DO NOTHING に最適化されるとロックが外れ H3 が再発する（公開保証なし）。
    // ロック取得の意図を SQL に明示し version 非依存にするため raw で書く。
    // SECURITY: tagged template は ${...} を prepared statement パラメータ化する
    // （injection セーフ）。直下の FOR UPDATE と同じく文字列結合へ変えないこと。
    await tx.$executeRaw`
      INSERT INTO "stocks" ("warehouse_id", "product_id", "quantity")
      VALUES (${warehouseId}, ${productId}, 0)
      ON CONFLICT ("warehouse_id", "product_id") DO UPDATE
        SET "quantity" = "stocks"."quantity"
    `;

    // SECURITY: Prisma の tagged template literal は ${...} を必ず prepared statement
    // パラメータ化する（SQL injection セーフ）。今後の保守者が文字列結合
    // （`tx.$queryRawUnsafe(...)` や `${...}` の外で連結）に変えると injection が入る。
    // ここは絶対に文字列結合へ変えないこと。
    return tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM "stocks"
      WHERE "warehouse_id" = ${warehouseId} AND "product_id" = ${productId}
      FOR UPDATE
    `;
  }

  upsertStockIncrement(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    productId: string,
    delta: number,
    fallbackQuantity: number,
  ) {
    return tx.stock.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      update: { quantity: { increment: delta } },
      create: { warehouseId, productId, quantity: fallbackQuantity },
    });
  }

  upsertStockOverwrite(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    productId: string,
    newQuantity: number,
  ) {
    return tx.stock.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      update: { quantity: newQuantity },
      create: { warehouseId, productId, quantity: newQuantity },
    });
  }

  createAdjustment(
    tx: Prisma.TransactionClient,
    data: {
      warehouseId: number;
      productId: string;
      adjustmentType: AdjustmentType;
      quantityBefore: number;
      quantityAfter: number;
      reason?: string;
      createdBy: string;
    },
  ) {
    return tx.stockAdjustment.create({ data });
  }

  /**
   * CODE-M2: 予測在庫の入荷見込みを (productId, warehouseId) 単位で一括集計する。
   * 旧実装は stock ごとに 1 クエリ投げており、ページ 20 件で最大 2N+1 = 41 クエリの
   * N+1 になっていた。本メソッドで 1 クエリにまとめ、呼び出し側がキー引きする。
   *
   * warehouse は line でなく親 Receiving 側の列のため groupBy では集計できない。
   * 親の status(DRAFT)/deletedAt と product 集合で絞った line を warehouseId 付きで
   * 取得し、(productId, warehouseId) 単位の合計をメモリ上で組み立てる。
   */
  async aggregatePendingReceivingByKey(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const lines = await this.prisma.receivingLine.findMany({
      where: {
        productId: { in: productIds },
        receiving: {
          status: ReceivingStatus.DRAFT,
          ...notDeleted,
        },
      },
      select: {
        productId: true,
        plannedQty: true,
        receiving: { select: { warehouseId: true } },
      },
    });

    return sumByForecastKey(
      lines.map((l) => ({
        productId: l.productId,
        warehouseId: l.receiving.warehouseId,
        plannedQty: l.plannedQty,
      })),
    );
  }

  /** CODE-M2: 出荷見込みを (productId, warehouseId) 単位で一括集計する（入荷側と同方針）。 */
  async aggregatePendingShipmentByKey(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const lines = await this.prisma.shipmentLine.findMany({
      where: {
        productId: { in: productIds },
        shipment: {
          status: ShipmentStatus.DRAFT,
          ...notDeleted,
        },
      },
      select: {
        productId: true,
        plannedQty: true,
        shipment: { select: { warehouseId: true } },
      },
    });

    return sumByForecastKey(
      lines.map((l) => ({
        productId: l.productId,
        warehouseId: l.shipment.warehouseId,
        plannedQty: l.plannedQty,
      })),
    );
  }
}

/** 予測在庫の入荷/出荷見込みを引くための合成キー（productId × warehouseId）。 */
export function forecastKey(productId: string, warehouseId: number): string {
  return `${productId}::${warehouseId}`;
}

/** (productId, warehouseId) 単位で plannedQty を合算した Map を作る。 */
function sumByForecastKey(
  rows: { productId: string; warehouseId: number; plannedQty: number }[],
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const key = forecastKey(r.productId, r.warehouseId);
    acc.set(key, (acc.get(key) ?? 0) + r.plannedQty);
  }
  return acc;
}
