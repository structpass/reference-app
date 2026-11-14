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
 *
 * 呼び元（詳細・編集のページ）が守る形（d1039）。2 つの読み込みがあって、見せ方が違う。
 *
 *   if (loading && !retrying) return <ローダー />;            // 初回の読み込み
 *   if (loadError || retrying) return <失敗の表示 busy={retrying} />;  // 失敗と、その再試行
 *
 * 初回は画面ごとローダーにする。失敗の後は失敗の表示をその場に残したまま、再試行の間だけ
 * busy を立てる（押した場所から画面が入れ替わらず、読み直していることが分かる）。
 * `retrying` は「失敗の表示から押し直した時」だけ立つので、成功している時の
 * reload では立たない（何も失敗していないのに失敗の表示へ切り替わらない）。
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
  // 再試行で読み直している最中か（d1039）。失敗の表示から押し直した時だけ true になる。
  //
  // 失敗の表示（LoadFailed）は「まだ 1 度も読めていない」時の画面なので、再試行の間も
  // その場に残して処理中を示す。ここを loading と兼ねると、呼び元の `if (loading) return <ローダー>`
  // が先に効いて失敗の表示ごと消え、押した位置から画面が入れ替わる（押せたのか分からない）。
  const [retrying, setRetrying] = useState(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  // 失敗の表示が出ているか（reload から見る。state を依存に入れると reload の同一性が変わる）。
  const loadErrorRef = useRef(loadError);
  loadErrorRef.current = loadError;
  // 直前の回の id（id が変わった時だけ読み直しの印を外すため）。
  const idRef = useRef(id);

  useEffect(() => {
    if (!id) return;
    setLoadError(false);
    // 読み直しの印は、id が変わった時（＝別の品目へ移った時）だけ外す（d1039）。
    // 前の回の finally は cleanup で active=false になり印を外さないため、再試行中に id が
    // 変わって新しい取得が終わらないと印が残り、失敗の表示が disabled のまま固まる。
    // 同じ id の再試行では外さない（外すと、reload が立てた印をこの effect がすぐ消してしまう）。
    if (idRef.current !== id) setRetrying(false);
    idRef.current = id;
    // id 切り替え（/x/1 → /x/2 等、同セグメントで state が保持される遷移）時に
    // 旧 fetch の遅延解決が新 id の item を上書かないよう、cleanup で捨てる
    // （rev-quality 2026-07-31 CODE-M1: stale response レースの解消）。
    let active = true;
    // fetchOne が同期的に throw する経路も拾う（d1039）。素直に呼ぶと effect の外へ例外が抜け、
    // finally が走らないため、再試行の処理中の印が立ったまま残って画面が止まる。
    new Promise<T | null>((resolve) => resolve(fetchOne(id)))
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
        if (active) {
          setLoading(false);
          // 読み直しが終わった（成功・失敗のどちらでも）処理中の印を外す（d1039）。
          setRetrying(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, fetchOne, seq]);

  /** 読み取りをやり直す（失敗の表示から再試行する時）。 */
  const reload = useCallback(() => {
    // 「失敗の表示に出ている時の再試行」か「初回の読み込み」かを、押された瞬間に決める。
    // 失敗の表示が出ていれば、その場に残して処理中を出す（初回はローダーのまま）。
    setRetrying(loadErrorRef.current);
    setLoadError(false);
    setLoading(true);
    setSeq((n) => n + 1);
  }, []);

  return { item, setItem, loading, loadError, reload, retrying };
}
