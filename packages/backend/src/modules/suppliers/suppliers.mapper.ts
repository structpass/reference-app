import { Supplier } from '@prisma/client';
import { SupplierResponseDto } from './dto/supplier-response.dto';

export function toSupplierResponse(entity: Supplier): SupplierResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    address: entity.address,
    phone: entity.phone,
    contactPerson: entity.contactPerson,
    email: entity.email,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
