import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ListConfig } from '../../common/services';
import { ok, okMessage } from '../../common/dto';
import { WarehousesRepository } from './repositories/warehouses.repository';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { FindWarehousesDto } from './dto/find-warehouses.dto';
import { toWarehouseResponse } from './warehouses.mapper';

const LIST_CONFIG: ListConfig = {
  searchFields: ['name', 'code'],
  allowedSortFields: ['createdAt', 'updatedAt', 'name', 'code', 'status'],
};

@Injectable()
export class WarehousesService {
  constructor(private readonly repo: WarehousesRepository) {}

  async findAll(query: FindWarehousesDto) {
    return this.repo.findManyPaginated(query, LIST_CONFIG);
  }

  async findAllForExport(query: FindWarehousesDto) {
    return this.repo.findManyForExport(query, LIST_CONFIG);
  }

  async findOne(id: number) {
    const warehouse = await this.repo.findById(id);

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return ok(toWarehouseResponse(warehouse));
  }

  async create(dto: CreateWarehouseDto) {
    const existing = await this.repo.findByCode(dto.code);

    if (existing) {
      throw new ConflictException(`Warehouse with code ${dto.code} already exists`);
    }

    const warehouse = await this.repo.create(dto);

    return ok(toWarehouseResponse(warehouse));
  }

  async update(id: number, dto: UpdateWarehouseDto) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Warehouse not found');
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.repo.findByCode(dto.code);
      if (codeExists) {
        throw new ConflictException(`Warehouse with code ${dto.code} already exists`);
      }
    }

    const warehouse = await this.repo.update(id, dto);

    return ok(toWarehouseResponse(warehouse));
  }

  async remove(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Warehouse not found');
    }

    await this.repo.delete(id);

    return okMessage('Warehouse deleted successfully');
  }
}
