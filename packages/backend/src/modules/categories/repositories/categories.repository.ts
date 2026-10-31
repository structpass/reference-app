import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginatedList, exportList, ListConfig, ListQueryParams } from '../../../common/services';
import { CategoryResponseDto } from '../dto/category-response.dto';
import { toCategoryResponse } from '../categories.mapper';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyPaginated(query: ListQueryParams, config: ListConfig) {
    return paginatedList<Category, CategoryResponseDto>(
      this.prisma.category,
      query,
      config,
      toCategoryResponse,
    );
  }

  findManyForExport(query: ListQueryParams, config: ListConfig) {
    return exportList<Category, CategoryResponseDto>(
      this.prisma.category,
      query,
      config,
      toCategoryResponse,
    );
  }

  findById(id: number): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  findByCode(code: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { code } });
  }

  create(data: Prisma.CategoryCreateInput): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  update(id: number, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  delete(id: number): Promise<Category> {
    return this.prisma.category.delete({ where: { id } });
  }
}
