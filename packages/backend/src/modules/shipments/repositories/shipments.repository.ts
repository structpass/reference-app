import { Injectable } from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindShipmentsDto } from '../dto/find-shipments.dto';
import {
  ShipmentResponseDto,
  ShipmentWithRelationsResponseDto,
} from '../dto/shipment-response.dto';
import {
  toShipmentResponse,
  toShipmentListResponse,
  toShipmentExportListResponse,
} from '../shipments.mapper';
import { buildPaginatedMeta, okPaginated, PaginatedResponse } from '../../../common/dto';
import { notDeleted } from '../../../common/helpers';

const SHIPMENT_INCLUDE = {
  warehouse: { select: { id: true, name: true, code: true } },
  carrier: { select: { id: true, name: true, code: true } },
  creator: { select: { id: true, name: true } },
  lines: {
    include: { product: { select: { id: true, name: true, code: true, unit: true } } },
    orderBy: { lineNo: 'asc' as const },
  },
} as const;

const ALLOWED_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'shipmentNo',
  'shipmentDate',
  'status',
] as const;

function buildWhere(query: FindShipmentsDto): Prisma.ShipmentWhereInput {
  const where: Prisma.ShipmentWhereInput = { ...notDeleted };

  if (query.search) {
    where.OR = [
      { shipmentNo: { contains: query.search, mode: 'insensitive' } },
      { destination: { contains: query.search, mode: 'insensitive' } },
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
export class ShipmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Entity 保持: 存在確認・DRAFT チェック用
  findById(id: number) {
    return this.prisma.shipment.findFirst({ where: { id, ...notDeleted } });
  }

  // Entity 保持: lines 処理（$transaction 内 soft-delete / confirm 用）
  findByIdWithLines(id: number) {
    return this.prisma.shipment.findFirst({
      where: { id, ...notDeleted },
      include: { lines: true },
    });
  }

  async findByIdWithRelations(id: number): Promise<ShipmentWithRelationsResponseDto | null> {
    const entity = await this.prisma.shipment.findFirst({
      where: { id, ...notDeleted },
      include: SHIPMENT_INCLUDE,
    });
    return entity ? toShipmentResponse(entity) : null;
  }

  async findManyPaginated(
    query: FindShipmentsDto,
  ): Promise<PaginatedResponse<ShipmentWithRelationsResponseDto>> {
    const { page = 1, limit = 20, order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortField]: order },
        include: SHIPMENT_INCLUDE,
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return okPaginated(toShipmentListResponse(data), buildPaginatedMeta(total, page, limit));
  }

  // findManyForExport は include なしの単純 findMany → base scalar fields のみ
  async findManyForExport(query: FindShipmentsDto): Promise<ShipmentResponseDto[]> {
    const { order = 'desc' } = query;
    const where = buildWhere(query);
    const sortField = resolveSort(query.sort);

    const data = await this.prisma.shipment.findMany({
      where,
      orderBy: { [sortField]: order },
    });
    return toShipmentExportListResponse(data);
  }

  async create(data: Prisma.ShipmentCreateInput): Promise<ShipmentWithRelationsResponseDto> {
    const entity = await this.prisma.shipment.create({
      data,
      include: SHIPMENT_INCLUDE,
    });
    return toShipmentResponse(entity);
  }

  // Entity 保持: $transaction 内部で使用（明細 delete→親 update を原子化）。Service 側で mapper 適用
  updateInTx(tx: Prisma.TransactionClient, id: number, data: Prisma.ShipmentUpdateInput) {
    return tx.shipment.update({
      where: { id },
      data,
      include: SHIPMENT_INCLUDE,
    });
  }

  async updateStatus(
    id: number,
    status: ShipmentStatus,
  ): Promise<ShipmentWithRelationsResponseDto> {
    const entity = await this.prisma.shipment.update({
      where: { id },
      data: { status },
      include: SHIPMENT_INCLUDE,
    });
    return toShipmentResponse(entity);
  }

  // Entity 保持: $transaction 内部で使用、DTO 化不可
  updateStatusInTx(tx: Prisma.TransactionClient, id: number, status: ShipmentStatus) {
    return tx.shipment.update({
      where: { id },
      data: { status },
      include: SHIPMENT_INCLUDE,
    });
  }

  softDelete(id: number) {
    return this.prisma.shipment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  softDeleteInTx(tx: Prisma.TransactionClient, id: number) {
    return tx.shipment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  deleteLinesInTx(tx: Prisma.TransactionClient, shipmentId: number) {
    return tx.shipmentLine.deleteMany({ where: { shipmentId } });
  }

  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
