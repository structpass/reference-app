import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ListConfig } from '../../common/services';
import { ok, okMessage } from '../../common/dto';
import { SuppliersRepository } from './repositories/suppliers.repository';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { FindSuppliersDto } from './dto/find-suppliers.dto';
import { toSupplierResponse } from './suppliers.mapper';

const LIST_CONFIG: ListConfig = {
  searchFields: ['name', 'code'],
  allowedSortFields: ['createdAt', 'updatedAt', 'name', 'code', 'status'],
};

@Injectable()
export class SuppliersService {
  constructor(private readonly repo: SuppliersRepository) {}

  async findAll(query: FindSuppliersDto) {
    return this.repo.findManyPaginated(query, LIST_CONFIG);
  }

  async findAllForExport(query: FindSuppliersDto) {
    return this.repo.findManyForExport(query, LIST_CONFIG);
  }

  async findOne(id: number) {
    const supplier = await this.repo.findById(id);

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return ok(toSupplierResponse(supplier));
  }

  async create(dto: CreateSupplierDto) {
    const existing = await this.repo.findByCode(dto.code);

    if (existing) {
      throw new ConflictException(`Supplier with code ${dto.code} already exists`);
    }

    const supplier = await this.repo.create(dto);

    return ok(toSupplierResponse(supplier));
  }

  async update(id: number, dto: UpdateSupplierDto) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Supplier not found');
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.repo.findByCode(dto.code);
      if (codeExists) {
        throw new ConflictException(`Supplier with code ${dto.code} already exists`);
      }
    }

    const supplier = await this.repo.update(id, dto);

    return ok(toSupplierResponse(supplier));
  }

  async remove(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Supplier not found');
    }

    await this.repo.delete(id);

    return okMessage('Supplier deleted successfully');
  }
}
