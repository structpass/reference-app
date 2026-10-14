import { Carrier } from '@prisma/client';
import { CarrierResponseDto } from './dto/carrier-response.dto';

export function toCarrierResponse(entity: Carrier): CarrierResponseDto {
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
