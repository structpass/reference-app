import { ActiveStatus } from '@prisma/client';

export interface CategoryResponseDto {
  id: number;
  code: string;
  name: string;
  status: ActiveStatus;
  createdAt: Date;
  updatedAt: Date;
}
