import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ListConfig } from '../../common/services';
import { ok, okMessage } from '../../common/dto';
import { CategoriesRepository } from './repositories/categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FindCategoriesDto } from './dto/find-categories.dto';
import { toCategoryResponse } from './categories.mapper';

const LIST_CONFIG: ListConfig = {
  searchFields: ['name', 'code'],
  allowedSortFields: ['createdAt', 'updatedAt', 'name', 'code', 'status'],
};

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  async findAll(query: FindCategoriesDto) {
    return this.repo.findManyPaginated(query, LIST_CONFIG);
  }

  async findAllForExport(query: FindCategoriesDto) {
    return this.repo.findManyForExport(query, LIST_CONFIG);
  }

  async findOne(id: number) {
    const category = await this.repo.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return ok(toCategoryResponse(category));
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.repo.findByCode(dto.code);

    if (existing) {
      throw new ConflictException(`Category with code ${dto.code} already exists`);
    }

    const category = await this.repo.create(dto);

    return ok(toCategoryResponse(category));
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.repo.findByCode(dto.code);
      if (codeExists) {
        throw new ConflictException(`Category with code ${dto.code} already exists`);
      }
    }

    const category = await this.repo.update(id, dto);

    return ok(toCategoryResponse(category));
  }

  async remove(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    await this.repo.delete(id);

    return okMessage('Category deleted successfully');
  }
}
