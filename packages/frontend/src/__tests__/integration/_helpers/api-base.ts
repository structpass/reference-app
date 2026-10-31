/**
 * Integration test 用の API base URL.
 *
 * apiClient は `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'` で
 * baseURL を解決する (lib/api-client.ts)。test env では env が無いのでデフォルト値が
 * そのまま使われる。MSW handler はこの URL を絶対パスとして登録する。
 */
export const API_BASE = 'http://localhost:3001/api/v1';

export const apiPath = (p: string) => `${API_BASE}${p.startsWith('/') ? p : `/${p}`}`;
