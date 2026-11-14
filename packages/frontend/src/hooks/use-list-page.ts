'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaginationMeta, TableId } from '@struct-pass/shared';
import { useTablePaginationPreference } from '@/features/list-preferences';
import { useCrudApi } from './use-crud-api';
import { usePagination, type PaginationState } from './use-pagination';

/** "10,20,50,100" → [10,20,50,100]。不正値は除外し空配列返却 */
function parsePageSizeOptions(csv: string | undefined): number[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** 一覧の取得に渡す引数。空の絞り込み（undefined・空文字）は落とした後の形 */
type ListQuery = Record<string, string | number>;

/** 差し替えた取得の戻り値。meta が無い（件数の無い一覧）時は null */
interface ListFetchResult<T> {
  data: T[];
  meta: PaginationMeta | null;
  /** 一覧と一緒に届いた画面固有の付帯情報（台帳定義など）。画面が res で受け取る */
  res?: unknown;
}

interface UseListPageOptions<T> {
  /** TABLE_IDS のいずれか。per-table のページサイズ設定取得に使用 */
  tableId: string;
  basePath: string;
  entityName: string;
  initialSort?: Partial<PaginationState>;
  /**
   * 一覧の取得手順を差し替える。渡さない画面は標準の一覧 API（GET {basePath}）を使う。
   * 台帳管理の一覧だけ、一覧 API の結果に台帳ごとの詳細（GET /object-types/:key）の項目数を
   * 足してから返す。失敗は投げる（空の一覧に倒すと、取得失敗が「0 件」と見分けられなくなる）。
   */
  fetch?: (query: ListQuery) => Promise<ListFetchResult<T>>;
}

/** 空の絞り込み（undefined・空文字）を落とす。絞り込みとして数えない値を取得にも渡さない */
function cleanQuery(query: Record<string, string | number | undefined>): ListQuery {
  const clean: ListQuery = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') clean[key] = value;
  }
  return clean;
}

/**
 * 一覧ページの基本フック。
 * tableId は必須。dashboard layout で ListPreferencesProvider が loaded まで render を gate
 * しているため、本フックが動く時点で preference は揃っている前提（無ければ DEFAULT_PAGE_SIZE）。
 *
 * 取得は 2 経路ある。標準の画面は useCrudApi の状態をそのまま返し、取得手順を差し替えた画面
 * （fetch を渡した画面）だけ自分の状態を持ち、失敗・再試行・0 件の案内の扱いは両者で同じにする。
 */
export function useListPage<T>(options: UseListPageOptions<T>) {
  const { tableId, basePath, entityName, initialSort, fetch: customFetch } = options;
  const crud = useCrudApi<T>(basePath, entityName);
  const preference = useTablePaginationPreference(tableId as TableId);
  const pagination = usePagination({
    ...initialSort,
    ...(preference ? { limit: preference.defaultPageSize } : {}),
  });
  const pageSizeOptions = useMemo(
    () => parsePageSizeOptions(preference?.pageSizeOptions),
    [preference?.pageSizeOptions],
  );
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  // 取得手順を差し替えた画面の状態
  const [customItems, setCustomItems] = useState<T[]>([]);
  const [customMeta, setCustomMeta] = useState<PaginationMeta | null>(null);
  const [customLoading, setCustomLoading] = useState(true);
  const [customInitialized, setCustomInitialized] = useState(false);
  const [customLoadError, setCustomLoadError] = useState(false);
  /**
   * 取得手順が一覧と一緒に返した、その画面固有の付帯情報（d931）。自由定義の台帳の一覧は、
   * 明細と一緒に届いた台帳定義（項目定義・台帳名）を画面へ渡す。res を返さない取得手順では null。
   */
  const [customRes, setCustomRes] = useState<unknown>(null);

  /**
   * 絞り込みの有無（d789）。0 件の案内を「まだ何も無い」と「条件に合う物が無い」で
   * 言い分けるために画面へ渡す。空文字・undefined は絞り込みとして数えない
   * （FilterBar は未選択を undefined で流す）。
   */
  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => !!value),
    [filters],
  );

  const { page, limit, sort, order, resetPage } = pagination;
  const query = useMemo(
    () => cleanQuery({ page, limit, sort, order, ...filters }),
    [page, limit, sort, order, filters],
  );

  const { fetchAll } = crud;

  /**
   * 差し替えた取得の世代（d832）。取得中に別の取得（絞り込み・頁送り・再試行）が始まったら、
   * 古い応答は捨てる。捨てないと、遅れて届いた前の条件の結果が今の表示を上書きする。
   * 標準の一覧の世代は useCrudApi が持ち、古い応答はどちらの経路も届いた時に捨てる（d898）。
   */
  const generationRef = useRef(0);

  /** 差し替えた取得。標準の一覧と同じく失敗は loadError に倒し、0 件とは区別する */
  const runCustomFetch = useCallback(async () => {
    if (!customFetch) return;
    const generation = ++generationRef.current;
    setCustomLoading(true);
    try {
      const result = await customFetch(query);
      if (generation !== generationRef.current) return;
      setCustomItems(result.data);
      setCustomMeta(result.meta);
      setCustomRes(result.res ?? null);
      setCustomLoadError(false);
    } catch {
      if (generation !== generationRef.current) return;
      // 失敗時の既存の行・件数は消さない（useCrudApi と同じ扱い）
      setCustomLoadError(true);
    } finally {
      if (generation === generationRef.current) {
        setCustomLoading(false);
        setCustomInitialized(true);
      }
    }
  }, [customFetch, query]);

  const load = useCallback(() => {
    if (customFetch) {
      void runCustomFetch();
      return;
    }
    // 標準の一覧は共有の取得を使う。遅れて届いた古い応答を捨てるかは useCrudApi の世代が決める
    void fetchAll(query);
  }, [customFetch, runCustomFetch, fetchAll, query]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * 取得失敗の表示からの再試行（d600）。同じ引数でも必ず取り直す。
   *
   * 失敗は 1 ページ目で最もよく起きるが、同じページを渡し直すだけでは load の依存が 1 つも
   * 変わらず再取得が走らないため、押しても失敗の表示が残った。引数を変えずに取得をやり直す
   * 経路をここで持ち、一覧の各画面はこれを受け取って「再試行」に繋ぐ（引数が変わる時は
   * 上の useEffect が拾う）。
   */
  const retryLoad = useCallback(() => {
    load();
  }, [load]);

  const handleFilterChange = useCallback(
    (newFilters: Record<string, string | undefined>) => {
      // 初期表示後の空条件通知など、有効な条件が同じなら取得を重ねない。
      setFilters((current) => {
        const keys = new Set([...Object.keys(current), ...Object.keys(newFilters)]);
        const unchanged = [...keys].every(
          (key) => (current[key] ?? '') === (newFilters[key] ?? ''),
        );
        return unchanged ? current : newFilters;
      });
      resetPage();
    },
    [resetPage],
  );

  return {
    items: customFetch ? customItems : crud.items,
    meta: customFetch ? customMeta : crud.meta,
    loading: customFetch ? customLoading : crud.loading,
    initialized: customFetch ? customInitialized : crud.initialized,
    loadError: customFetch ? customLoadError : crud.loadError,
    /** 取得手順が返した付帯情報（res を返す取得手順だけ）。初期値と失敗時は null */
    res: customFetch ? customRes : null,
    pagination,
    pageSizeOptions,
    filters,
    hasActiveFilters,
    handleFilterChange,
    reload: load,
    retryLoad,
    remove: crud.remove,
  };
}
