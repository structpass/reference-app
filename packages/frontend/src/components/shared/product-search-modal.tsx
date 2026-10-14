'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Product, PaginationMeta } from '@struct-pass/shared';
import apiClient from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/shared/pagination';
import { Spinner } from '@/components/ui/spinner';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { Search, ArrowUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber } from '@/lib/utils';

interface ProductSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

const SORTABLE_COLUMNS = [
  { key: 'code', label: 'コード' },
  { key: 'name', label: '商品名' },
  { key: 'category', label: 'カテゴリー' },
  { key: 'price', label: '価格' },
  { key: 'stockQuantity', label: '在庫数' },
] as const;

export function ProductSearchModal({ open, onClose, onSelect }: ProductSearchModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('code');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const skipDebounceRef = useRef(false);
  const requestIdRef = useRef(0);
  // 明細 hover 帯（ref-0038・rete mdl-0050 追随）。旧: hover:bg-accent/50。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('tbody tr');

  const fetchProducts = useCallback(
    async (params: {
      search?: string;
      category?: string;
      page?: number;
      sort?: string;
      order?: string;
    }) => {
      // 最新リクエストのみ state へ反映するレースガード。複数 fetch が in-flight でも、
      // 遅れて返った古い応答が新しい応答を上書きしないよう requestId で判定する
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const res = await apiClient.get('/products', {
          params: { ...params, limit: 10, status: 'ACTIVE' },
        });
        if (requestId !== requestIdRef.current) return;
        setProducts(res.data.data);
        setMeta(res.data.meta);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setProducts([]);
        setMeta(null);
        toast.error('商品の検索に失敗しました');
      } finally {
        // 最新リクエストのみ loading を解除。stale な応答の finally では触らず、
        // in-flight 中の最新 fetch が自身の finally で解除するのに委ねる
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setCategory('');
    setSort('code');
    setOrder('asc');
    skipDebounceRef.current = true;
    fetchProducts({ page: 1, sort: 'code', order: 'asc' });
  }, [open, fetchProducts]);

  useEffect(() => {
    if (!open) return;
    if (skipDebounceRef.current) {
      skipDebounceRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchProducts({
        search: search || undefined,
        category: category || undefined,
        page: 1,
        sort,
        order,
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, category, open, fetchProducts, sort, order]);

  const handlePageChange = (newPage: number) => {
    fetchProducts({
      search: search || undefined,
      category: category || undefined,
      page: newPage,
      sort,
      order,
    });
  };

  const handleSort = (col: string) => {
    const newOrder = sort === col && order === 'asc' ? 'desc' : 'asc';
    // sort / order は debounce effect の依存に含まれるため、setSort/setOrder は
    // debounce effect を再走させ二重フェッチを生む。open 時と同様 skip フラグで
    // 抑止し、ここでの即時 fetch 一本に揃える。直後の setState 群は React が
    // バッチ処理し effect は次 render で 1 回だけ走るため skip フラグ 1 枚で足りる
    skipDebounceRef.current = true;
    setSort(col);
    setOrder(newOrder);
    fetchProducts({
      search: search || undefined,
      category: category || undefined,
      page: 1,
      sort: col,
      order: newOrder,
    });
  };

  const handleSelect = (product: Product) => {
    onSelect(product);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>商品検索</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sp-text-warm-mute)]" />
            <Input
              placeholder="コード・商品名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input
            placeholder="カテゴリーで絞り込み"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-48"
          />
        </div>

        <div
          ref={listRef}
          className="relative min-h-[400px] flex-1 overflow-auto rounded-md border border-border"
          onMouseOver={onMouseOver}
          onMouseLeave={onMouseLeave}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--sp-paper-2)]">
              <tr>
                {SORTABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="cursor-pointer select-none px-3 py-2 text-left font-medium text-[var(--sp-text-warm-mute)] hover:text-[var(--sp-text-warm)]"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown
                        className={`h-3 w-3 ${sort === col.key ? 'text-[var(--sp-text-warm)]' : 'text-[var(--sp-text-warm-mute)]'}`}
                      />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // プレースホルダ行も rowSelector('tbody tr') にマッチし帯が乗りうるため、
                // sp-row-pillable でセル内容を前面化し帯がテキスト上に被らないようにする
                // （code-reviewer MEDIUM 指摘）。
                <tr className="sp-row-pillable">
                  <td colSpan={5} className="px-3 py-12 text-center">
                    <Spinner className="mx-auto h-6 w-6 text-primary" />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr className="sp-row-pillable">
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-[var(--sp-text-warm-mute)]"
                  >
                    該当する商品がありません
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr
                    key={p.id}
                    className="sp-row-pillable cursor-pointer border-t border-border transition-colors"
                    onClick={() => handleSelect(p)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-[var(--sp-text-warm-mute)]">
                      {p.category?.name ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(p.price ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(p.stockQuantity ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {bandStyle ? (
            <div aria-hidden="true" className="sp-row-hoverband" style={bandStyle} />
          ) : null}
        </div>

        {meta && <Pagination meta={meta} onPageChange={handlePageChange} />}
      </DialogContent>
    </Dialog>
  );
}
