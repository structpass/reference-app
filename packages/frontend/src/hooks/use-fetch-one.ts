'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  // 読み取りが失敗したか。null の時の理由を「無い」と「取れなかった」で
  // 分けるため（d600）。取得し直せば戻す。
  const [loadError, setLoadError] = useState(false);
  // reload の呼び出しを effect の再実行に映すための番号（id と fetchOne は変わらないことがある）。
  const [seq, setSeq] = useState(0);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!id) return;
    setLoadError(false);
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
        if (active) {
          setItem(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, fetchOne, seq]);

  /** 読み取りをやり直す（失敗の表示から再試行する時）。 */
  const reload = useCallback(() => {
    setLoadError(false);
    setLoading(true);
    setSeq((n) => n + 1);
  }, []);

  return { item, setItem, loading, loadError, reload };
}
