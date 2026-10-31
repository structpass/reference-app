import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

export interface GroupFixture {
  id: number;
  code: string;
  name: string;
  description?: string;
  role: 'WH_USER' | 'WH_ADMIN' | 'OF_USER' | 'OF_ADMIN' | 'SYS_ADMIN';
}

export function groupsListHandler(items: GroupFixture[] = defaultGroups) {
  return http.get(apiPath('/groups'), () =>
    HttpResponse.json({
      data: items,
      meta: { total: items.length, page: 1, limit: 10, totalPages: 1 },
    }),
  );
}

export const groupsDeleteHandler = http.delete(apiPath('/groups/:id'), () =>
  HttpResponse.json({ data: { success: true } }),
);

export const defaultGroups: GroupFixture[] = [
  {
    id: 1,
    code: 'G-001',
    name: '倉庫オペレーター',
    description: '倉庫の現場担当',
    role: 'WH_USER',
  },
  { id: 2, code: 'G-002', name: '事務管理', description: '事務の管理職', role: 'OF_ADMIN' },
];
