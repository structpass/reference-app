import { Injectable } from '@nestjs/common';
import { Prisma, Product, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindProductsDto } from '../dto/find-products.dto';
import { ProductResponseDto } from '../dto/product-response.dto';
import { toProductResponse } from '../products.mapper';
import { buildPaginatedMeta, okPaginated, type RecordScope } from '../../../common/dto';

const PRODUCT_INCLUDE = {
  category: { select: { id: true, code: true, name: true } },
  creator: { select: { id: true, name: true } },
  updater: { select: { id: true, name: true } },
} as const;

const PRODUCT_INCLUDE_CREATE = {
  category: { select: { id: true, code: true, name: true } },
  creator: { select: { id: true, name: true } },
} as const;

const ALLOWED_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'code',
  'price',
  'stockQuantity',
  'categoryId',
] as const;

function buildWhere(query: FindProductsDto): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { code: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.status) where.status = query.status;
  // 記録の有無の条件は AND に追記する（上書きにすると、後から AND 条件を足した時に消える）
  if (query.recordScope) {
    const existing = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [...existing, buildRecordScopeWhere(query.recordScope)];
  }

  return where;
}

function resolveSort(sort: string | undefined): string {
  if (!sort) return 'createdAt';
  return (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'createdAt';
}

/**
 * 業務の明細（案件・入荷・出荷・棚卸）から指されている品目に絞る条件。
 * 一覧と書き出しの「記録の有無」の絞り込みで同じ条件を使う。
 */
function buildUsedInRecordsFilter(): Prisma.ProductWhereInput {
  return {
    OR: [
      { orderItems: { some: {} } },
      { receivingLines: { some: {} } },
      { shipmentLines: { some: {} } },
      { stocktakingItems: { some: {} } },
    ],
  };
}

function buildRecordScopeWhere(recordScope: RecordScope): Prisma.ProductWhereInput {
  const noneInRecords: Prisma.ProductWhereInput = {
    NOT: buildUsedInRecordsFilter(),
  };
  return recordScope === 'used' ? buildUsedInRecordsFilter() : noneInRecords;
}

/**
 * 一覧の並び順。並べ替えの項目が同点の時は id で順を固定し、
 * 頁を送った時に同じ行が二度出たり抜けたりしないようにする。
 */
function buildListOrderBy(
  sortField: string,
  order: 'asc' | 'desc',
): Prisma.ProductOrderByWithRelationInput[] {
  return [{ [sortField]: order }, { id: 'asc' }];
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  findByIdWithRelations(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
  }

  findByCode(code: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { code } });
  }

  /**
   * 与えた code 集合のうち既存のものを返す（CSV 取込の dryRun 見込み件数算出用）。
   * 1 クエリで解決し、行ごとの point query を避ける。
   */
  async findExistingCodes(codes: string[]): Promise<Set<string>> {
    if (codes.length === 0) return new Set();
    const found = await this.prisma.product.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    return new Set(found.map((p) => p.code));
  }

  async findManyPaginated(query: FindProductsDto) {
    const { page = 1, limit = 20, order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: buildListOrderBy(sortField, order),
        include: PRODUCT_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    return okPaginated(data.map(toProductResponse), buildPaginatedMeta(total, page, limit));
  }

  async findManyForExport(query: FindProductsDto): Promise<ProductResponseDto[]> {
    const { order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const data = await this.prisma.product.findMany({
      where,
      orderBy: buildListOrderBy(sortField, order),
      include: PRODUCT_INCLUDE_CREATE,
    });
    return data.map(toProductResponse);
  }

  create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({
      data,
      include: PRODUCT_INCLUDE_CREATE,
    });
  }

  update(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({
      where: { id },
      data,
      include: PRODUCT_INCLUDE,
    });
  }

  delete(id: string): Promise<Product> {
    return this.prisma.product.delete({ where: { id } });
  }

  /**
   * 検証済みの N 行を単一トランザクションで code 基準に upsert する（all-or-nothing）。
   *
   * - `$transaction` は本 Repository が所有する（architecture-invariants §2 — Service / Importer は ORM を直接呼ばない）。
   * - `code` 一致は update（既存値を行内容で上書き）、新規 `code` は create。削除はしない。
   * - `Decimal` 変換 / category `connect` は本メソッド内で構築する。
   * - 任意列の `null` は update 句に明示送出してクリアする（`undefined` だと Prisma が「変更なし」扱い）。
   * - 1 行でも失敗すればトランザクション全体が rollback される。
   */
  async bulkUpsertByCode(
    rows: BulkUpsertProductRow[],
    userId: string,
  ): Promise<{ created: number; updated: number }> {
    if (rows.length === 0) return { created: 0, updated: 0 };

    return this.prisma.$transaction(
      async (tx) => {
        // 既存行を 1 クエリで引き、行ごとの point query（N+1）を避ける。
        const existing = await tx.product.findMany({
          where: { code: { in: rows.map((r) => r.code) } },
          select: { id: true, code: true },
        });
        const existingIdByCode = new Map(existing.map((p) => [p.code, p.id]));

        let created = 0;
        let updated = 0;

        for (const row of rows) {
          const existingId = existingIdByCode.get(row.code);

          if (existingId !== undefined) {
            await tx.product.update({
              where: { id: existingId },
              data: {
                name: row.name,
                // null を明示送出して既存値をクリアする（行 = 完全な目標状態 — spec §4.3）
                description: row.description,
                category: { connect: { id: row.categoryId } },
                price: new Prisma.Decimal(row.price),
                purchasePrice:
                  row.purchasePrice === null ? null : new Prisma.Decimal(row.purchasePrice),
                unit: row.unit,
                status: row.status,
                updater: { connect: { id: userId } },
              },
            });
            updated++;
          } else {
            await tx.product.create({
              data: {
                code: row.code,
                name: row.name,
                description: row.description,
                category: { connect: { id: row.categoryId } },
                price: new Prisma.Decimal(row.price),
                purchasePrice:
                  row.purchasePrice === null ? null : new Prisma.Decimal(row.purchasePrice),
                unit: row.unit,
                status: row.status,
                creator: { connect: { id: userId } },
              },
            });
            created++;
          }
        }

        return { created, updated };
      },
      // 最大 1 万行を 1 トランザクションで処理するため、既定 5 秒では不足する。
      { timeout: 60_000, maxWait: 10_000 },
    );
  }
}

/**
 * `bulkUpsertByCode` が受け取る検証済み行。任意列の空欄は明示 `null` に正規化済み。
 * `categoryId` は importer 側で category code から解決済み。
 */
export interface BulkUpsertProductRow {
  code: string;
  name: string;
  description: string | null;
  categoryId: number;
  price: number;
  purchasePrice: number | null;
  unit: string | null;
  status: ProductStatus;
}
