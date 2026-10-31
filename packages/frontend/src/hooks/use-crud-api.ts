'use client';

import { useState, useCallback, useRef } from 'react';
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
  // 一覧の読み取りが失敗したか。失敗時は items が空のままなので、これを見ないと
  // 「取得できなかった」と「本当に 0 件」が画面で同じに見える（d600）。再取得が成功すれば戻す。
  const [loadError, setLoadError] = useState(false);
  // 詳細の読み取りが失敗したか。読み取り経路ごとに状態を分け、一覧と詳細を同じ画面で
  // 使う時（編集画面）に片方の失敗が他方の表示を巻き込まないようにする。
  const [fetchOneError, setFetchOneError] = useState(false);

  /**
   * 一覧の取得の世代（d898）。取得中に別の取得（絞り込み・頁送り・再試行）が始まったら、
   * 遅れて届いた古い応答は捨てる。捨てないと、前の条件の結果が今の表示を上書きする。
   * 応答を捨てるかは、取った時の世代（この取得を始めた時の値）と今の世代を比べて決める。
   */
  const listGeneration = useRef(0);

  const fetchAll = useCallback(
    async (params: FetchParams = {}) => {
      const generation = ++listGeneration.current;
      setLoading(true);
      try {
        const res = await apiClient.get(basePath, { params });
        if (generation !== listGeneration.current) return;
        setItems(res.data.data);
        setMeta(res.data.meta ?? null);
        setLoadError(false);
      } catch {
        // 失敗時の既存の行・件数は消さない。画面は loadError を見て失敗を出す。
        if (generation !== listGeneration.current) return;
        setLoadError(true);
        toast.error(`${entityName}一覧の取得に失敗しました`);
      } finally {
        if (generation === listGeneration.current) {
          setLoading(false);
          setInitialized(true);
        }
      }
    },
    [basePath, entityName],
  );

  const fetchOne = useCallback(
    async (id: string | number): Promise<T | null> => {
      try {
        const res = await apiClient.get(`${basePath}/${id}`);
        setFetchOneError(false);
        return res.data.data;
      } catch (err) {
        setFetchOneError(true);
        // 読み取りの失敗は呼び元（useFetchOne）へ投げ、画面に「取得できなかった」を出す。
        // ここで null に潰すと、useFetchOne は null を「見つからない」として扱うため、
        // 失敗が「見つかりませんでした」と嘘の案内になる（d600・d864）。
        toast.error(`${entityName}の取得に失敗しました`);
        throw err;
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

  return {
    items,
    meta,
    loading,
    initialized,
    loadError,
    fetchOneError,
    fetchAll,
    fetchOne,
    create,
    update,
    remove,
  };
}
