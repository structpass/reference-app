import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { notDeleted } from '../../../common/helpers';

interface FindOptions {
  search?: string;
  warehouseId?: number;
}

@Injectable()
export class ShippingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findReceivings(options: FindOptions) {
    const where: Prisma.ReceivingWhereInput = { ...notDeleted };

    if (options.search) {
      where.OR = [
        { receivingNo: { contains: options.search, mode: 'insensitive' } },
        { supplier: { name: { contains: options.search, mode: 'insensitive' } } },
      ];
    }
    if (options.warehouseId) {
      where.warehouseId = options.warehouseId;
    }

    return this.prisma.receiving.findMany({
      where,
      include: {
        warehouse: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });
  }

  findShipments(options: FindOptions) {
    const where: Prisma.ShipmentWhereInput = { ...notDeleted };

    if (options.search) {
      where.OR = [
        { shipmentNo: { contains: options.search, mode: 'insensitive' } },
        { destination: { contains: options.search, mode: 'insensitive' } },
      ];
    }
    if (options.warehouseId) {
      where.warehouseId = options.warehouseId;
    }

    return this.prisma.shipment.findMany({
      where,
      include: { warehouse: { select: { name: true } } },
    });
  }
}
