import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

interface MasterFixture {
  id: number;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  [key: string]: unknown;
}

/**
 * carriers / suppliers / warehouses 等、ほぼ同一 shape の master entity 共通 handler factory.
 */
export function masterListHandler(path: string, items: MasterFixture[]) {
  return http.get(apiPath(path), () =>
    HttpResponse.json({
      data: items,
      meta: { total: items.length, page: 1, limit: 10, totalPages: 1 },
    }),
  );
}

export function masterDeleteHandler(path: string) {
  return http.delete(apiPath(`${path}/:id`), () => HttpResponse.json({ data: { success: true } }));
}

export const defaultCarriers: MasterFixture[] = [
  { id: 1, code: 'C-001', name: 'ヤマト運輸', status: 'ACTIVE' },
  { id: 2, code: 'C-002', name: '佐川急便', status: 'ACTIVE' },
];

export const defaultSuppliers: MasterFixture[] = [
  { id: 1, code: 'S-001', name: '仕入先 A', status: 'ACTIVE' },
  { id: 2, code: 'S-002', name: '仕入先 B', status: 'INACTIVE' },
];

export const defaultWarehouses: MasterFixture[] = [
  { id: 1, code: 'W-001', name: '東京倉庫', capacity: 1000, status: 'ACTIVE' },
  { id: 2, code: 'W-002', name: '大阪倉庫', capacity: 500, status: 'ACTIVE' },
];
