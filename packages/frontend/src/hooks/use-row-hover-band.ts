'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';

/**
 * 明細一覧の hover 帯スライド追従（rete mdl-0050 からの移植・正本=rete モデルタブ「マウスホバー表現」）。
 * リポが別のためコード複製で持ち込む（rete: src/hooks/use-row-hover-band.ts）。axis 対応は rete
 * dsk-0386 で確立した縦横一般化を追随（cmn-0129）。
 *
 * 行ごとの :hover 背景ではなく「絶対配置の単一帯要素を測位して transform で滑らせる」方式
 * （グローバルナビ .nav-hoverband と同語彙・ref-0035 追随）。hover 先が移るとき前の行から
 * 滑って追従する。
 *
 * 使い方:
 * - 一覧コンテナ（行の offsetParent になる position:relative な要素）に listRef と
 *   onMouseOver / onMouseLeave を張る。
 * - コンテナ末尾に装飾専用の帯要素（.sp-row-hoverband・aria-hidden）を bandStyle が
 *   非 null の時だけ描く。行側には .sp-row-pillable を付け z-index を確保する
 *   （テーブルでは [data-list-compact] tbody td の z-index 規則が同役割）。
 * - rowSelector は帯対象行の CSS セレクタ（例: 'li.sp-row-pillable'）。帯要素自身が
 *   マッチしないセレクタにすること（pointer-events:none のため通常は問題にならない）。
 * - axis='horizontal'（タブ列など）は width/left 方向で測位し、height/top は呼び出し側の
 *   CSS で固定する（bandStyle は width+transform のみを返す）。
 *
 * 注意: 測位は offsetTop/offsetHeight または offsetLeft/offsetWidth（offsetParent 基準）。
 * テーブル行（tr）で使う場合はコンテナ（wrapper）とテーブルの間に余白やキャプションを挟まないこと
 * （ズレの原因になる）。
 */
export type HoverBandAxis = 'vertical' | 'horizontal';

export function useRowHoverBand<E extends HTMLElement = HTMLElement>(
  rowSelector: string,
  axis: HoverBandAxis = 'vertical',
) {
  const listRef = useRef<E | null>(null);
  const [rect, setRect] = useState<{ start: number; size: number } | null>(null);
  // 一覧の外から入ってきた最初の 1 回はスライドさせず即時に置く。true になって以降のみ追従アニメ。
  const shown = useRef(false);

  const measureRow = useCallback(
    (row: HTMLElement) => {
      if (!listRef.current?.contains(row)) return;
      setRect((prev) => {
        const next =
          axis === 'horizontal'
            ? { start: row.offsetLeft, size: row.offsetWidth }
            : { start: row.offsetTop, size: row.offsetHeight };
        return prev && prev.start === next.start && prev.size === next.size ? prev : next;
      });
    },
    [axis],
  );

  const onMouseOver = useCallback(
    (e: ReactMouseEvent<E>) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>(rowSelector);
      if (!row) return;
      measureRow(row);
    },
    [rowSelector, measureRow],
  );

  const onMouseLeave = useCallback(() => {
    shown.current = false;
    setRect(null);
  }, []);

  useEffect(() => {
    if (rect) shown.current = true;
  }, [rect]);

  const bandStyle: CSSProperties | null = rect
    ? axis === 'horizontal'
      ? {
          width: rect.size,
          transform: `translate3d(${rect.start}px, 0, 0)`,
          transition: shown.current ? undefined : 'none',
        }
      : {
          height: rect.size,
          transform: `translate3d(0, ${rect.start}px, 0)`,
          transition: shown.current ? undefined : 'none',
        }
    : null;

  return { listRef, onMouseOver, onMouseLeave, bandStyle, measureRow };
}
