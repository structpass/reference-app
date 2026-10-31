import { ActiveStatus } from './warehouse';

export interface Category {
  id: number;
  code: string;
  name: string;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}
