import { Injectable } from '@nestjs/common';
import { Prisma, AdjustmentType, ReceivingStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindStocksDto } from '../dto/find-stocks.dto';
import { FindForecastDto } from '../dto/find-forecast.dto';
import { StockWithRelationsResponseDto, StockExportResponseDto } from '../dto/stock-response.dto';
import { toStockWithRelationsListResponse, toStockExportListResponse } from '../stocks.mapper';
import type { StockWithRelations } from '../stocks.mapper';
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

/**
 * 品目の検索条件（検索語が品目名・品目コードのどちらかに一部一致）。通常の在庫一覧・エクスポートと
 * 予測在庫の両方がこの 1 つを使う。画面ごとに別々に書くと、片方だけ直した時に同じ検索語で
 * 返る品目がずれるため、条件の形はここだけで決める。
 *
 * 外から見えるのは「名とコードの両方を見る OR」までで、項の順・mode は問わない（下の
 * productSearchLookup が同じ意味を Prisma 側の条件からも読む）。
 */
export function productSearchWhere(search: string): Prisma.ProductWhereInput {
  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ],
  };
}

/**
 * 品目の条件から「どの列を一部一致で見て、何を探すか」を取り出す。DTO の search（@IsString を通った
 * 文字列）から productSearchWhere を作った条件だけを想定し、OR の項も name/code のどちらかで
 * contains を持つ形だけを扱う。見えない条件は黙って落とさず例外にする（絞り込みが外れた一覧を
 * 返すより、呼び出しの誤りとして止める）。
 */
export function productSearchLookup(
  productWhere: Prisma.ProductWhereInput | undefined,
): { columns: readonly ('name' | 'code')[]; pattern: string } | undefined {
  if (!productWhere) return undefined;
  const terms = productWhere.OR;
  if (!Array.isArray(terms) || terms.length === 0) {
    throw new Error('品目の条件に検索語の項（OR）がありません');
  }
  let pattern: string | undefined;
  const columns = new Set<'name' | 'code'>();
  for (const raw of terms) {
    const term = raw as Record<string, { contains?: unknown } | undefined>;
    for (const column of ['name', 'code'] as const) {
      const contains = term[column]?.contains;
      if (typeof contains !== 'string' || contains.length === 0) continue;
      if (pattern !== undefined && contains !== pattern) {
        throw new Error('品目の条件に別々の検索語があります');
      }
      pattern = contains;
      columns.add(column);
    }
  }
  return pattern === undefined ? undefined : { columns: [...columns], pattern };
}

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
      ...productSearchWhere(query.search),
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
    where.product = productSearchWhere(query.search);
  }
  return where;
}

/**
 * 予測在庫の行の骨（stock × 品目 × 倉庫 × 分類）から、品目と分類の結合だけをキー集合で先に絞る。
 *
 * 品目の条件は、条件そのものが「どの列を一部一致で見るか」を持っている。よって項の並びを
 * 拾って止めるのではなく、条件から見る列と検索語を取り出し、その列だけを副問いで照合する
 * （条件から code を落としたら副問いも code を見ない＝画面ごとに絞り込みの中身がずれない）。
 * 大きさを打ち切らない時に全体で 1 段だけになる副問いは、ここで作る。
 */
function limitedProductIdSource(lookup: {
  columns: readonly ('name' | 'code')[];
  pattern: string;
}): Prisma.Sql {
  // 大文字小文字を区別しない一部一致。検索語はそのまま挟み（記号もワイルドカードとして扱う）、
  // 大小は DB 側の lower() で揃える（これまでの ILIKE と同じ規則）。索引も lower() の値に張る。
  const pattern = `%${lookup.pattern}%`;
  const match = Prisma.join(
    lookup.columns.map((column) => Prisma.sql`lower(${Prisma.raw(column)}) LIKE lower(${pattern})`),
    ' OR ',
  );
  return Prisma.sql`(SELECT id FROM products WHERE ${match})`;
}

function resolveSort(sort: string | undefined): string {
  if (!sort) return 'id';
  return (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'id';
}

/**
 * 予測在庫の一覧の 1 行は「stock × その品目」（画面の呼び名＝item）。行数・並び・ページの単位・
 * 総数は stock の行で決まる（stock の id 昇順）。
 *
 * 品目の条件は、stock の副問い（product_id IN (...)）として先に確定させる。Prisma の
 * findMany + include は品目の条件を stock の副問いとして流すため、品目名の一部一致が品目の索引で
 * 効かず、一覧を開くたびに残高の全件を読んでいた（残高が増えるほど遅くなる）。
 * 品目を IN で先に絞る形にすると、残高は品目との索引でだけ引かれ、残高の行数に比例して遅くならない。
 * 品目を先に読んで stock を後から引く 2 回の問いは、読む品目数に上限を置かざるを得ず、
 * 上限で行が欠けうるため採らない。
 */
function buildForecastSql(
  where: Prisma.StockWhereInput,
  mode: 'page' | 'count' | 'export',
  page = 1,
  limit = 20,
): Prisma.Sql {
  const capped = mode !== 'export';
  // 2 つの問いは同じ条件を使う。stocks に相関名 s を付ける問い（ページ・書き出し）は s. を伴い、
  // 付けない問い（件数・続きの位置を求める内側の問い）は伴わない。
  const prefix = mode === 'count' ? Prisma.empty : Prisma.sql`s.`;
  const conditions: Prisma.Sql[] = [];
  // 書き出しの問いで、品目の結合そのものに載せる条件（打ち切る問いは品目の副問いを
  // 絞り込みの内側に置くので、これは書き出しの時だけ使う）。conditions とは分けて持つ
  // （混ぜると、倉庫の条件が結合の位置へ流れ込んで SQL が壊れる）。
  let exportProductJoin: Prisma.Sql | undefined;
  // 続きの位置を求める内側の問い（前ページまでの最後の id を探す）の条件。品目の条件は
  // 内側にも載せる（載せないと総数の大きい範囲で前のページを数え直すことになる）。
  const seekConditions: Prisma.Sql[] = [];
  if (typeof where.warehouseId === 'number') {
    conditions.push(Prisma.sql`${prefix}warehouse_id = ${where.warehouseId}`);
    seekConditions.push(Prisma.sql`a.warehouse_id = ${where.warehouseId}`);
  }
  const lookup = productSearchLookup(where.product as Prisma.ProductWhereInput | undefined);
  if (lookup !== undefined) {
    const source = limitedProductIdSource(lookup);
    // 品目の副問いは、絞り込みの内側で限ってよい（その範囲の stocks より広い行は返り得ない）。
    // これで外の問いは行を読む段で止まり、件数を数える段で残高の全件を走らない。
    // どう載せるか（絞り込みの条項か、品目の結合そのものの条件か）は下の capped の分岐で決める。
    if (capped) {
      conditions.push(Prisma.sql`${prefix}product_id IN ${source}`);
    } else {
      exportProductJoin = Prisma.sql`JOIN products p ON p.id = s.product_id AND ${prefix}product_id IN ${source}`;
    }
    seekConditions.push(Prisma.sql`a.product_id IN ${source}`);
  }
  const filter =
    conditions.length === 0 ? Prisma.empty : Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  const seekFilter =
    seekConditions.length === 0
      ? Prisma.empty
      : Prisma.sql`WHERE ${Prisma.join(seekConditions, ' AND ')}`;

  if (mode === 'count') {
    return Prisma.sql`SELECT count(*)::int AS total FROM stocks ${filter}`;
  }

  // 品目・倉庫・分類は stock との 1:1 の結合で付ける（行は増えない）。
  // 列の選択は STOCK_INCLUDE に合わせ、呼び出し側の形を findMany の include と同じに保つ。
  // 品目の条件は、打ち切りの有無で載る位置が変わる（下の capped の分岐で決める）。
  const head = Prisma.sql`
    SELECT s.id, s.warehouse_id, s.product_id, s.quantity, s.updated_at,
           w.id AS w_id, w.name AS w_name, w.code AS w_code,
           p.name AS p_name, p.code AS p_code, p.unit AS p_unit,
           c.id AS c_id, c.name AS c_name
    FROM stocks s`;
  // 打ち切る問いは品目の条件を絞り込みの内側（WHERE）に置き、行を読む段で止める。
  // 書き出しは打ち切りをかけず、品目の結合そのものへ条件を置く（絞り込みが結合の前段で済む）。
  const productJoin = exportProductJoin ?? Prisma.sql`JOIN products p ON p.id = s.product_id`;
  const joins = Prisma.sql`
    ${productJoin}
    JOIN warehouses w ON w.id = s.warehouse_id
    LEFT JOIN categories c ON c.id = p.category_id`;
  const order = Prisma.sql`ORDER BY s.id ASC`;
  const seekOrder = Prisma.sql`ORDER BY a.id ASC`;

  if (capped) {
    // 深いページも同じ速さで送る。行数で OFFSET を飛ばすと、飛ばす行もすべて読み並べるため
    // ページが深くなるほど遅くなる。前ページの最後の id より大きい行から limit 件取る形にすると、
    // 読む行は id 順の索引で求まる limit 件だけで済む（id は一意なので同じ行を二度返さない）。
    if (page <= 1) {
      return Prisma.sql`${head} ${joins} ${filter} ${order} LIMIT ${limit}`;
    }
    const seek = Prisma.sql`s.id > (SELECT a.id FROM stocks a ${seekFilter} ${seekOrder} LIMIT 1 OFFSET ${(page - 1) * limit - 1})`;
    const whereSeek =
      filter === Prisma.empty ? Prisma.sql`WHERE ${seek}` : Prisma.sql`${filter} AND ${seek}`;
    return Prisma.sql`${head} ${joins} ${whereSeek} ${order} LIMIT ${limit}`;
  }

  return Prisma.sql`${head} ${joins} ${filter} ${order} LIMIT ${limit}`;
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

  /** 予測在庫の一覧（d651）。並び・件数・ページの単位は stock の行のまま、品目名の検索で残高の全件を読まない形にした。 */
  async findManyForForecast(query: FindForecastDto) {
    const { page = 1, limit = 20 } = query;
    const where = buildForecastWhere(query);

    const [items, totalRows] = await Promise.all([
      this.findForecastItemPage(where, page, limit),
      this.prisma.$queryRaw<{ total: number }[]>(buildForecastSql(where, 'count')),
    ]);

    return { stocks: items, total: totalRows[0]?.total ?? 0, page, limit };
  }

  /** 予測在庫の書き出し 1 回分。（d811） */
  async findManyForForecastExport(query: FindForecastDto, limit: number) {
    const where = buildForecastWhere(query);
    return this.findForecastItemRows(buildForecastSql(where, 'export', 1, limit));
  }

  /** 1 ページ分を 1 問で取る（並びは stock の id 昇順、打ち切りは行数でのページ送りだけ）。 */
  async findForecastItemPage(
    where: Prisma.StockWhereInput,
    page: number,
    limit: number,
  ): Promise<StockWithRelations[]> {
    return this.findForecastItemRows(buildForecastSql(where, 'page', page, limit));
  }

  /** 予測在庫の行を取る問いを 1 つ流し、画面の形（stock × 品目 × 倉庫 × 分類）へ組み立てる。 */
  private async findForecastItemRows(query: Prisma.Sql): Promise<StockWithRelations[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: number;
        warehouse_id: number;
        product_id: string;
        quantity: number;
        updated_at: Date;
        w_id: number;
        w_name: string;
        w_code: string;
        p_name: string;
        p_code: string;
        p_unit: string | null;
        c_id: number | null;
        c_name: string | null;
      }[]
    >(query);

    return rows.map((r) => ({
      id: r.id,
      warehouseId: r.warehouse_id,
      productId: r.product_id,
      quantity: r.quantity,
      updatedAt: r.updated_at,
      warehouse: { id: r.w_id, name: r.w_name, code: r.w_code },
      product: {
        id: r.product_id,
        name: r.p_name,
        code: r.p_code,
        unit: r.p_unit,
        category: r.c_id === null ? null : { id: r.c_id, name: r.c_name ?? '' },
      },
    })) as unknown as StockWithRelations[];
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
