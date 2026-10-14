import { Injectable } from '@nestjs/common';
import { Carrier, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginatedList, exportList, ListConfig, ListQueryParams } from '../../../common/services';
import { CarrierResponseDto } from '../dto/carrier-response.dto';
import { toCarrierResponse } from '../carriers.mapper';

@Injectable()
export class CarriersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyPaginated(query: ListQueryParams, config: ListConfig) {
    return paginatedList<Carrier, CarrierResponseDto>(
      this.prisma.carrier,
      query,
      config,
      toCarrierResponse,
    );
  }

  findManyForExport(query: ListQueryParams, config: ListConfig) {
    return exportList<Carrier, CarrierResponseDto>(
      this.prisma.carrier,
      query,
      config,
      toCarrierResponse,
    );
  }

  findById(id: number): Promise<Carrier | null> {
    return this.prisma.carrier.findUnique({ where: { id } });
  }

  findByCode(code: string): Promise<Carrier | null> {
    return this.prisma.carrier.findUnique({ where: { code } });
  }

  create(data: Prisma.CarrierCreateInput): Promise<Carrier> {
    return this.prisma.carrier.create({ data });
  }

  update(id: number, data: Prisma.CarrierUpdateInput): Promise<Carrier> {
    return this.prisma.carrier.update({ where: { id }, data });
  }

  delete(id: number): Promise<Carrier> {
    return this.prisma.carrier.delete({ where: { id } });
  }
}
