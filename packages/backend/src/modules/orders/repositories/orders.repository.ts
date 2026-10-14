import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindOrdersDto } from '../dto/find-orders.dto';
import { notDeleted } from '../../../common/helpers';
import { toOrderResponse } from '../orders.mapper';
import { buildPaginatedMeta, okPaginated } from '../../../common/dto';
import { OrderResponseDto } from '../dto/order-response.dto';

const ORDER_INCLUDE = {
  supplier: { select: { id: true, name: true, code: true } },
  creator: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { id: true, name: true, code: true, unit: true } } },
    orderBy: { lineNo: 'asc' as const },
  },
} as const;

const ALLOWED_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'orderNo',
  'orderDate',
  'status',
  'totalAmount',
] as const;

function buildWhere(query: FindOrdersDto): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { ...notDeleted };

  if (query.search) {
    where.OR = [
      { orderNo: { contains: query.search, mode: 'insensitive' } },
      { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  if (query.status) where.status = query.status;

  return where;
}

function resolveSort(sort: string | undefined): string {
  if (!sort) return 'createdAt';
  return (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'createdAt';
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.order.findFirst({ where: { id, ...notDeleted } });
  }

  findByIdWithRelations(id: number) {
    return this.prisma.order.findFirst({
      where: { id, ...notDeleted },
      include: ORDER_INCLUDE,
    });
  }

  async findManyPaginated(query: FindOrdersDto) {
    const { page = 1, limit = 20, order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortField]: order },
        include: ORDER_INCLUDE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return okPaginated(data.map(toOrderResponse), buildPaginatedMeta(total, page, limit));
  }

  async findManyForExport(query: FindOrdersDto): Promise<OrderResponseDto[]> {
    const { order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const data = await this.prisma.order.findMany({
      where,
      orderBy: { [sortField]: order },
      include: ORDER_INCLUDE,
    });
    return data.map(toOrderResponse);
  }

  create(data: Prisma.OrderCreateInput) {
    return this.prisma.order.create({
      data,
      include: ORDER_INCLUDE,
    });
  }

  update(id: number, data: Prisma.OrderUpdateInput) {
    return this.prisma.order.update({
      where: { id },
      data,
      include: ORDER_INCLUDE,
    });
  }

  // Entity 保持: $transaction 内部で使用（明細 delete→親 update を原子化）
  updateInTx(tx: Prisma.TransactionClient, id: number, data: Prisma.OrderUpdateInput) {
    return tx.order.update({
      where: { id },
      data,
      include: ORDER_INCLUDE,
    });
  }

  softDelete(id: number) {
    return this.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  deleteItemsInTx(tx: Prisma.TransactionClient, orderId: number) {
    return tx.orderItem.deleteMany({ where: { orderId } });
  }

  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
