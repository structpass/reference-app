import { Injectable } from '@nestjs/common';
import { Prisma, StocktakingStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindStocktakingsDto } from '../dto/find-stocktakings.dto';
import {
  StocktakingResponseDto,
  StocktakingWithRelationsResponseDto,
} from '../dto/stocktaking-response.dto';
import {
  toStocktakingResponse,
  toStocktakingListResponse,
  toStocktakingExportListResponse,
} from '../stocktakings.mapper';
import { buildPaginatedMeta, okPaginated, PaginatedResponse } from '../../../common/dto';

const STOCKTAKING_INCLUDE = {
  warehouse: { select: { id: true, name: true, code: true } },
  creator: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { id: true, name: true, code: true, unit: true } } },
  },
} as const;

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'stocktakingDate', 'status'] as const;

function buildWhere(query: FindStocktakingsDto): Prisma.StocktakingWhereInput {
  const where: Prisma.StocktakingWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.warehouseId) where.warehouseId = query.warehouseId;

  return where;
}

function resolveSort(sort: string | undefined): string {
  if (!sort) return 'createdAt';
  return (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'createdAt';
}

@Injectable()
export class StocktakingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Entity 保持: 存在確認・DRAFT チェック用
  findById(id: number) {
    return this.prisma.stocktaking.findUnique({ where: { id } });
  }

  // Entity 保持: items 処理（$transaction 内 confirm 用）
  findByIdWithItems(id: number) {
    return this.prisma.stocktaking.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  // Entity 保持: 呼び出し側の $transaction 内で対象棚卸行を FOR UPDATE し、ロック後の
  // 最新 status と明細を返す。Service はこの固定値だけで認可・遷移を判定する。
  // 文書ロックを先に取ることで、同一伝票の並行 confirm が直列化される（在庫更新の
  // productId 昇順ロックより前に取るため、文書ロック→在庫ロックの順序が一貫する）。
  async lockByIdWithItemsInTx(tx: Prisma.TransactionClient, id: number) {
    await tx.$queryRaw`
      SELECT "id" FROM "stocktakings"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    return tx.stocktaking.findUnique({ where: { id }, include: { items: true } });
  }

  async findByIdWithRelations(id: number): Promise<StocktakingWithRelationsResponseDto | null> {
    const entity = await this.prisma.stocktaking.findUnique({
      where: { id },
      include: STOCKTAKING_INCLUDE,
    });
    return entity ? toStocktakingResponse(entity) : null;
  }

  async findManyPaginated(
    query: FindStocktakingsDto,
  ): Promise<PaginatedResponse<StocktakingWithRelationsResponseDto>> {
    const { page = 1, limit = 20, order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.stocktaking.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortField]: order },
        include: STOCKTAKING_INCLUDE,
      }),
      this.prisma.stocktaking.count({ where }),
    ]);

    return okPaginated(toStocktakingListResponse(data), buildPaginatedMeta(total, page, limit));
  }

  // findManyForExport は include なしの単純 findMany → base scalar fields のみ
  async findManyForExport(query: FindStocktakingsDto): Promise<StocktakingResponseDto[]> {
    const { order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const data = await this.prisma.stocktaking.findMany({
      where,
      orderBy: { [sortField]: order },
    });
    return toStocktakingExportListResponse(data);
  }

  async create(data: Prisma.StocktakingCreateInput): Promise<StocktakingWithRelationsResponseDto> {
    const entity = await this.prisma.stocktaking.create({ data, include: STOCKTAKING_INCLUDE });
    return toStocktakingResponse(entity);
  }

  // Entity 保持: $transaction 内部で使用（明細 delete→親 update を原子化）。Service 側で mapper 適用
  updateInTx(tx: Prisma.TransactionClient, id: number, data: Prisma.StocktakingUpdateInput) {
    return tx.stocktaking.update({
      where: { id },
      data,
      include: STOCKTAKING_INCLUDE,
    });
  }

  // Entity 保持: $transaction 内部で使用、DTO 化不可
  updateStatusInTx(tx: Prisma.TransactionClient, id: number, status: StocktakingStatus) {
    return tx.stocktaking.update({
      where: { id },
      data: { status },
      include: STOCKTAKING_INCLUDE,
    });
  }

  delete(id: number) {
    return this.prisma.stocktaking.delete({ where: { id } });
  }

  // Entity 保持: $transaction 内部で使用（文書ロック後の状態判定と削除を同一 tx に閉じる）
  deleteInTx(tx: Prisma.TransactionClient, id: number) {
    return tx.stocktaking.delete({ where: { id } });
  }

  deleteItemsInTx(tx: Prisma.TransactionClient, stocktakingId: number) {
    return tx.stocktakingItem.deleteMany({ where: { stocktakingId } });
  }

  /**
   * 文書行ロックを取る tx。**timeout を明示する。**
   *
   * 既定は 5 秒で、先行する並行 confirm が文書ロック（と在庫ロック）を保持している間に
   * 失効すると P2028 になり、PrismaExceptionFilter が 503 へ写す。要求は「競合した後続は
   * 既存の業務エラー（BadRequestException = 400）とする」なので、敗者が 400 にならず 503 に
   * なる経路を残さない。値は同一リポジトリの groups / users / products と同じ
   * `{ timeout: 60_000, maxWait: 10_000 }` に揃える。
   */
  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 60_000, maxWait: 10_000 });
  }
}
