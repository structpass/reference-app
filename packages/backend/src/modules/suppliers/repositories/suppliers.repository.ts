import { Injectable } from '@nestjs/common';
import { Supplier, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginatedList, exportList, ListConfig, ListQueryParams } from '../../../common/services';
import { SupplierResponseDto } from '../dto/supplier-response.dto';
import { toSupplierResponse } from '../suppliers.mapper';

@Injectable()
export class SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyPaginated(query: ListQueryParams, config: ListConfig) {
    return paginatedList<Supplier, SupplierResponseDto>(
      this.prisma.supplier,
      query,
      config,
      toSupplierResponse,
    );
  }

  findManyForExport(query: ListQueryParams, config: ListConfig) {
    return exportList<Supplier, SupplierResponseDto>(
      this.prisma.supplier,
      query,
      config,
      toSupplierResponse,
    );
  }

  findById(id: number): Promise<Supplier | null> {
    return this.prisma.supplier.findUnique({ where: { id } });
  }

  findByCode(code: string): Promise<Supplier | null> {
    return this.prisma.supplier.findUnique({ where: { code } });
  }

  create(data: Prisma.SupplierCreateInput): Promise<Supplier> {
    return this.prisma.supplier.create({ data });
  }

  update(id: number, data: Prisma.SupplierUpdateInput): Promise<Supplier> {
    return this.prisma.supplier.update({ where: { id }, data });
  }

  delete(id: number): Promise<Supplier> {
    return this.prisma.supplier.delete({ where: { id } });
  }
}
