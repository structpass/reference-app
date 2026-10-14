import { Warehouse } from '@prisma/client';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';

export function toWarehouseResponse(entity: Warehouse): WarehouseResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    address: entity.address,
    phone: entity.phone,
    manager: entity.manager,
    capacity: entity.capacity,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
