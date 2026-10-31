import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ListConfig } from '../../common/services';
import { ok, okMessage } from '../../common/dto';
import { CarriersRepository } from './repositories/carriers.repository';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { UpdateCarrierDto } from './dto/update-carrier.dto';
import { FindCarriersDto } from './dto/find-carriers.dto';
import { toCarrierResponse } from './carriers.mapper';

const LIST_CONFIG: ListConfig = {
  searchFields: ['name', 'code'],
  allowedSortFields: ['createdAt', 'updatedAt', 'name', 'code', 'status'],
};

@Injectable()
export class CarriersService {
  constructor(private readonly repo: CarriersRepository) {}

  async findAll(query: FindCarriersDto) {
    return this.repo.findManyPaginated(query, LIST_CONFIG);
  }

  async findAllForExport(query: FindCarriersDto) {
    return this.repo.findManyForExport(query, LIST_CONFIG);
  }

  async findOne(id: number) {
    const carrier = await this.repo.findById(id);

    if (!carrier) {
      throw new NotFoundException('Carrier not found');
    }

    return ok(toCarrierResponse(carrier));
  }

  async create(dto: CreateCarrierDto) {
    const existing = await this.repo.findByCode(dto.code);

    if (existing) {
      throw new ConflictException(`Carrier with code ${dto.code} already exists`);
    }

    const carrier = await this.repo.create(dto);

    return ok(toCarrierResponse(carrier));
  }

  async update(id: number, dto: UpdateCarrierDto) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Carrier not found');
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.repo.findByCode(dto.code);
      if (codeExists) {
        throw new ConflictException(`Carrier with code ${dto.code} already exists`);
      }
    }

    const carrier = await this.repo.update(id, dto);

    return ok(toCarrierResponse(carrier));
  }

  async remove(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Carrier not found');
    }

    await this.repo.delete(id);

    return okMessage('Carrier deleted successfully');
  }
}
