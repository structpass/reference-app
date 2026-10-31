import { ActiveStatus } from '@prisma/client';

export interface CarrierResponseDto {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  contactPerson: string | null;
  email: string | null;
  status: ActiveStatus;
  createdAt: Date;
  updatedAt: Date;
}
