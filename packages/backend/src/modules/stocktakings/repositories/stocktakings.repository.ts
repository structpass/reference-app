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

  deleteItemsInTx(tx: Prisma.TransactionClient, stocktakingId: number) {
    return tx.stocktakingItem.deleteMany({ where: { stocktakingId } });
  }

  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
