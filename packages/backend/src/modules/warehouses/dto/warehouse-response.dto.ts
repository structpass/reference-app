import { ActiveStatus } from '@prisma/client';

export interface WarehouseResponseDto {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  manager: string | null;
  capacity: number | null;
  status: ActiveStatus;
  createdAt: Date;
  updatedAt: Date;
}
