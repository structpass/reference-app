'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import type { TableId } from '@struct-pass/shared';
import { fetchColumnWidths, upsertColumnWidth } from '../api';

/**
 * 列幅永続化用 module store。
 * tableId 単位に { columnKey: width } を保持する。
 *
 * 動作仕様:
 * - 楽観更新: drag 中に store を即時書き換え（DOM へ即反映）
 * - debounced PUT: drag end (mouseup) 後 300ms で 1 度だけ API 呼び出し
 * - 競合制御: last-write-wins（plan H）。失敗時は revalidate で巻き戻す
 * - 読み込み時クランプ: 呼び出し側で max(savedWidth, minWidth) を行う想定
 */
type Listener = () => void;

interface TableState {
  widths: Record<string, number>;
  initialized: boolean;
  isLoading: boolean;
  error: Error | null;
}

const tables = new Map<TableId, TableState>();
const listeners = new Map<TableId, Set<Listener>>();
const inflightFetches = new Map<TableId, Promise<void>>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DEBOUNCE_MS = 300;

function emptyTableState(): TableState {
  return { widths: {}, initialized: false, isLoading: false, error: null };
}

function ensureTable(tableId: TableId): TableState {
  let s = tables.get(tableId);
  if (!s) {
    s = emptyTableState();
    tables.set(tableId, s);
  }
  return s;
}

function emit(tableId: TableId) {
  const set = listeners.get(tableId);
  if (set) for (const l of set) l();
}

function setTable(tableId: TableId, next: Partial<TableState>) {
  const cur = ensureTable(tableId);
  tables.set(tableId, { ...cur, ...next });
  emit(tableId);
}

function subscribe(tableId: TableId, l: Listener): () => void {
  let set = listeners.get(tableId);
  if (!set) {
    set = new Set();
    listeners.set(tableId, set);
  }
  set.add(l);
  return () => {
    set.delete(l);
  };
}

async function revalidate(tableId: TableId): Promise<void> {
  const existing = inflightFetches.get(tableId);
  if (existing) return existing;
  const p = (async () => {
    setTable(tableId, { isLoading: true });
    try {
      const list = await fetchColumnWidths(tableId);
      const widths: Record<string, number> = {};
      for (const item of list) {
        widths[item.columnKey] = item.width;
      }
      setTable(tableId, { widths, isLoading: false, error: null, initialized: true });
    } catch (err) {
      setTable(tableId, {
        isLoading: false,
        error: err instanceof Error ? err : new Error('fetch failed'),
        initialized: true,
      });
    } finally {
      inflightFetches.delete(tableId);
    }
  })();
  inflightFetches.set(tableId, p);
  return p;
}

/**
 * すべての table state を初期化。ログアウト時に呼ぶ。
 */
export function resetColumnWidthsStore() {
  tables.clear();
  inflightFetches.clear();
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
  for (const set of listeners.values()) {
    for (const l of set) l();
  }
}

/** テスト用エイリアス */
export const __resetColumnWidthsStoreForTest = resetColumnWidthsStore;

/** テスト用 / SSR 用: 初期 widths を直接注入する */
export function __setColumnWidthsForTest(tableId: TableId, widths: Record<string, number>) {
  setTable(tableId, { widths, initialized: true, isLoading: false, error: null });
}

export function useTableColumnWidths(tableId: TableId) {
  // tableId に対応する snapshot を取り出す。tableId 単位で subscribe する
  const snapshot = useSyncExternalStore(
    useCallback((l) => subscribe(tableId, l), [tableId]),
    useCallback(() => ensureTable(tableId), [tableId]),
    useCallback(() => ensureTable(tableId), [tableId]),
  );
  const initRef = useRef<Set<TableId>>(new Set());

  useEffect(() => {
    const cur = ensureTable(tableId);
    if (!cur.initialized && !inflightFetches.has(tableId) && !initRef.current.has(tableId)) {
      initRef.current.add(tableId);
      void revalidate(tableId);
    }
  }, [tableId]);

  /**
   * 列幅を更新する（楽観更新 + debounced PUT）。
   * drag 中の連続呼び出しは store だけ即時更新し、最後の呼び出しから 300ms で 1 度 API に flush する。
   */
  const setWidth = useCallback(
    (columnKey: string, width: number) => {
      // backend DTO は @IsInt() のため、入口で整数に丸める（PointerEvent.clientX が小数を返すケースに防衛）
      const w = Math.round(width);
      const cur = ensureTable(tableId);
      setTable(tableId, { widths: { ...cur.widths, [columnKey]: w } });

      const timerKey = `${tableId}::${columnKey}`;
      const existing = debounceTimers.get(timerKey);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        debounceTimers.delete(timerKey);
        const finalWidth = ensureTable(tableId).widths[columnKey] ?? w;
        upsertColumnWidth(tableId, columnKey, finalWidth).catch(() => {
          toast.error('列幅の保存に失敗しました');
          void revalidate(tableId);
        });
      }, DEBOUNCE_MS);
      debounceTimers.set(timerKey, timer);
    },
    [tableId],
  );

  return {
    widths: snapshot.widths,
    initialized: snapshot.initialized,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    setWidth,
    revalidate: useCallback(() => revalidate(tableId), [tableId]),
  };
}
