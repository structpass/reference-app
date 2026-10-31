/**
 * API レスポンス共通型と生成ヘルパー。
 * 全 Service が `{ success: true, data, meta? }` の形で返す現行仕様を集約する。
 * ページネーション meta は shared の PaginationMeta を単一 SSOT として再利用する（§5）。
 */
import type { PaginationMeta } from '@struct-pass/shared';

export type { PaginationMeta };

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

export interface SingleResponse<T> {
  success: true;
  data: T;
}

export interface MessageResponse {
  success: true;
  data: { message: string };
}

export function ok<T>(data: T): SingleResponse<T> {
  return { success: true, data };
}

export function okPaginated<T>(data: T[], meta: PaginationMeta): PaginatedResponse<T> {
  return { success: true, data, meta };
}

export function okMessage(message: string): MessageResponse {
  return { success: true, data: { message } };
}

export function buildPaginatedMeta(total: number, page: number, limit: number): PaginationMeta {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}
