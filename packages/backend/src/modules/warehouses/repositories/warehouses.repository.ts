import { Injectable } from '@nestjs/common';
import { Warehouse, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginatedList, exportList, ListConfig, ListQueryParams } from '../../../common/services';
import { WarehouseResponseDto } from '../dto/warehouse-response.dto';
import { toWarehouseResponse } from '../warehouses.mapper';

@Injectable()
export class WarehousesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyPaginated(query: ListQueryParams, config: ListConfig) {
    return paginatedList<Warehouse, WarehouseResponseDto>(
      this.prisma.warehouse,
      query,
      config,
      toWarehouseResponse,
    );
  }

  findManyForExport(query: ListQueryParams, config: ListConfig) {
    return exportList<Warehouse, WarehouseResponseDto>(
      this.prisma.warehouse,
      query,
      config,
      toWarehouseResponse,
    );
  }

  findById(id: number): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  findByCode(code: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({ where: { code } });
  }

  create(data: Prisma.WarehouseCreateInput): Promise<Warehouse> {
    return this.prisma.warehouse.create({ data });
  }

  update(id: number, data: Prisma.WarehouseUpdateInput): Promise<Warehouse> {
    return this.prisma.warehouse.update({ where: { id }, data });
  }

  delete(id: number): Promise<Warehouse> {
    return this.prisma.warehouse.delete({ where: { id } });
  }
}
