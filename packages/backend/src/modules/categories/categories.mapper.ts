import { Category } from '@prisma/client';
import { CategoryResponseDto } from './dto/category-response.dto';

export function toCategoryResponse(entity: Category): CategoryResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
