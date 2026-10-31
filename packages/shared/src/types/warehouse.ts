export enum ActiveStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  manager?: string | null;
  capacity?: number | null;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Carrier {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}
