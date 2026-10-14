'use client';

import { useEffect, useRef, useState } from 'react';

type FetchOneFn<T> = (id: string) => Promise<T | null>;

/**
 * 詳細ページ（[id]/page.tsx・[id]/view/page.tsx）の「id で1件取得して state に持つ」
 * 定型（useState item/loading + useEffect fetch）を共通化する（ref-0042 / invariants §3）。
 *
 * onSuccess は取得成功時（data が非 null）に呼ばれ、'skip-set' を返すと item への
 * セットを行わない。伝票系編集ページの「status !== 'DRAFT' なら view へ router.replace し
 * item は更新しない」既存分岐をページ側に残したまま表現するための口。
 * onSuccess は ref 経由で参照するため、ページ側はインライン関数を渡してよい
 * （effect の再実行を誘発しない）。
 */
export function useFetchOne<T>(
  fetchOne: FetchOneFn<T>,
  id: string | undefined,
  onSuccess?: (data: T) => void | 'skip-set',
) {
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!id) return;
    // id 切り替え（/x/1 → /x/2 等、同セグメントで state が保持される遷移）時に
    // 旧 fetch の遅延解決が新 id の item を上書かないよう、cleanup で捨てる
    // （rev-quality 2026-07-31 CODE-M1: stale response レースの解消）。
    let active = true;
    fetchOne(id)
      .then((data) => {
        if (!active) return;
        if (data !== null && onSuccessRef.current) {
          if (onSuccessRef.current(data) === 'skip-set') return;
        }
        setItem(data);
      })
      .catch(() => {
        if (active) setItem(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, fetchOne]);

  return { item, setItem, loading };
}
