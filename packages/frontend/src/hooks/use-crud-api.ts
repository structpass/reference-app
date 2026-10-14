'use client';

import { useState, useCallback } from 'react';
import type { PaginationMeta } from '@struct-pass/shared';
import apiClient from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-utils';
import toast from 'react-hot-toast';

interface FetchParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: unknown;
}

export function useCrudApi<T, TPayload = Record<string, unknown>>(
  basePath: string,
  entityName: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const fetchAll = useCallback(
    async (params: FetchParams = {}) => {
      setLoading(true);
      try {
        const res = await apiClient.get(basePath, { params });
        setItems(res.data.data);
        setMeta(res.data.meta ?? null);
      } catch {
        toast.error(`${entityName}一覧の取得に失敗しました`);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    },
    [basePath, entityName],
  );

  const fetchOne = useCallback(
    async (id: string | number): Promise<T | null> => {
      try {
        const res = await apiClient.get(`${basePath}/${id}`);
        return res.data.data;
      } catch {
        toast.error(`${entityName}の取得に失敗しました`);
        return null;
      }
    },
    [basePath, entityName],
  );

  const create = useCallback(
    async (data: TPayload): Promise<boolean> => {
      try {
        await apiClient.post(basePath, data);
        toast.success(`${entityName}を登録しました`);
        return true;
      } catch (err: unknown) {
        toast.error(extractErrorMessage(err, `${entityName}の登録に失敗しました`));
        return false;
      }
    },
    [basePath, entityName],
  );

  const update = useCallback(
    async (id: string | number, data: TPayload): Promise<boolean> => {
      try {
        await apiClient.put(`${basePath}/${id}`, data);
        toast.success('更新が完了しました');
        return true;
      } catch (err: unknown) {
        toast.error(extractErrorMessage(err, `${entityName}の更新に失敗しました`));
        return false;
      }
    },
    [basePath, entityName],
  );

  const remove = useCallback(
    async (id: string | number): Promise<boolean> => {
      try {
        await apiClient.delete(`${basePath}/${id}`);
        toast.success(`${entityName}を削除しました`);
        return true;
      } catch (err: unknown) {
        // 拒否の理由（409「掲示の宛先に指定されているため削除できません」等）は API が返す。
        // 汎用文言に潰すと、操作者が次に取る一手（宛先の変更依頼）が消える（v2-424）。
        toast.error(extractErrorMessage(err, `${entityName}の削除に失敗しました`));
        return false;
      }
    },
    [basePath, entityName],
  );

  return { items, meta, loading, initialized, fetchAll, fetchOne, create, update, remove };
}
