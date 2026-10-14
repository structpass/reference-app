import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

export interface UserFixture {
  id: number;
  name: string;
  email: string;
  // role=null は pending（承認待ち / 権限待ち）を表す。
  role: 'WH_USER' | 'WH_ADMIN' | 'OF_USER' | 'OF_ADMIN' | 'SYS_ADMIN' | null;
  isActive: boolean;
  // ref-0066: SSO 連携状態と許可フラグ（ユーザー編集画面の SSO 連携セクション用）。
  oidcLinked: boolean;
  allowOidcLink: boolean;
}

export function usersListHandler(items: UserFixture[] = defaultUsers) {
  return http.get(apiPath('/users'), () =>
    HttpResponse.json({
      data: items,
      meta: { total: items.length, page: 1, limit: 10, totalPages: 1 },
    }),
  );
}

export function usersDetailHandler(user: UserFixture) {
  return http.get(apiPath('/users/:id'), () => HttpResponse.json({ data: user }));
}

export const usersUpdateHandler = http.put(apiPath('/users/:id'), () =>
  HttpResponse.json({ data: { success: true } }),
);

export const usersDeleteHandler = http.delete(apiPath('/users/:id'), () =>
  HttpResponse.json({ data: { success: true } }),
);

export const defaultUsers: UserFixture[] = [
  {
    id: 1,
    name: 'admin',
    email: 'admin@example.com',
    role: 'SYS_ADMIN',
    isActive: true,
    oidcLinked: true,
    allowOidcLink: false,
  },
  {
    id: 2,
    name: 'wh-admin',
    email: 'wh-admin@example.com',
    role: 'WH_ADMIN',
    isActive: true,
    oidcLinked: false,
    allowOidcLink: false,
  },
  {
    id: 3,
    name: 'of-user',
    email: 'of-user@example.com',
    role: 'OF_USER',
    isActive: false,
    oidcLinked: false,
    allowOidcLink: false,
  },
];
