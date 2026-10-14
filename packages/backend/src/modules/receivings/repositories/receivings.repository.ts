import { Injectable } from '@nestjs/common';
import { Prisma, ReceivingStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindReceivingsDto } from '../dto/find-receivings.dto';
import { ReceivingWithRelationsResponseDto } from '../dto/receiving-response.dto';
import { toReceivingResponse, toReceivingListResponse } from '../receivings.mapper';
import { buildPaginatedMeta, okPaginated, PaginatedResponse } from '../../../common/dto';
import { notDeleted } from '../../../common/helpers';

const RECEIVING_INCLUDE = {
  warehouse: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, code: true } },
  creator: { select: { id: true, name: true } },
  lines: {
    include: { product: { select: { id: true, name: true, code: true, unit: true } } },
    orderBy: { lineNo: 'asc' as const },
  },
} as const;

const ALLOWED_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'receivingNo',
  'receivingDate',
  'status',
] as const;

function buildWhere(query: FindReceivingsDto): Prisma.ReceivingWhereInput {
  const where: Prisma.ReceivingWhereInput = { ...notDeleted };

  if (query.search) {
    where.OR = [
      { receivingNo: { contains: query.search, mode: 'insensitive' } },
      { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.warehouseId) where.warehouseId = query.warehouseId;

  return where;
}

function resolveSort(sort: string | undefined): string {
  if (!sort) return 'createdAt';
  return (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'createdAt';
}

@Injectable()
export class ReceivingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.receiving.findFirst({ where: { id, ...notDeleted } });
  }

  findByIdWithLines(id: number) {
    return this.prisma.receiving.findFirst({
      where: { id, ...notDeleted },
      include: { lines: true },
    });
  }

  async findByIdWithRelations(id: number): Promise<ReceivingWithRelationsResponseDto | null> {
    const entity = await this.prisma.receiving.findFirst({
      where: { id, ...notDeleted },
      include: RECEIVING_INCLUDE,
    });
    return entity ? toReceivingResponse(entity) : null;
  }

  async findManyPaginated(
    query: FindReceivingsDto,
  ): Promise<PaginatedResponse<ReceivingWithRelationsResponseDto>> {
    const { page = 1, limit = 20, order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.receiving.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortField]: order },
        include: RECEIVING_INCLUDE,
      }),
      this.prisma.receiving.count({ where }),
    ]);

    return okPaginated(toReceivingListResponse(data), buildPaginatedMeta(total, page, limit));
  }

  async findManyForExport(query: FindReceivingsDto): Promise<ReceivingWithRelationsResponseDto[]> {
    const { order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const data = await this.prisma.receiving.findMany({
      where,
      orderBy: { [sortField]: order },
      include: RECEIVING_INCLUDE,
    });
    return toReceivingListResponse(data);
  }

  async create(data: Prisma.ReceivingCreateInput): Promise<ReceivingWithRelationsResponseDto> {
    const entity = await this.prisma.receiving.create({ data, include: RECEIVING_INCLUDE });
    return toReceivingResponse(entity);
  }

  // Entity 保持: $transaction 内部で使用（明細 delete→親 update を原子化）。Service 側で mapper 適用
  updateInTx(tx: Prisma.TransactionClient, id: number, data: Prisma.ReceivingUpdateInput) {
    return tx.receiving.update({
      where: { id },
      data,
      include: RECEIVING_INCLUDE,
    });
  }

  async updateStatus(
    id: number,
    status: ReceivingStatus,
  ): Promise<ReceivingWithRelationsResponseDto> {
    const entity = await this.prisma.receiving.update({
      where: { id },
      data: { status },
      include: RECEIVING_INCLUDE,
    });
    return toReceivingResponse(entity);
  }

  // Entity 保持: $transaction 内部で使用、DTO 化不可
  updateStatusInTx(tx: Prisma.TransactionClient, id: number, status: ReceivingStatus) {
    return tx.receiving.update({
      where: { id },
      data: { status },
      include: RECEIVING_INCLUDE,
    });
  }

  softDelete(id: number) {
    return this.prisma.receiving.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  softDeleteInTx(tx: Prisma.TransactionClient, id: number) {
    return tx.receiving.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  deleteLinesInTx(tx: Prisma.TransactionClient, receivingId: number) {
    return tx.receivingLine.deleteMany({ where: { receivingId } });
  }

  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
