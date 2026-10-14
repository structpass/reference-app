'use client';

import { useRouter } from 'next/navigation';
import type { Product } from '@struct-pass/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface SortConfig {
  sort: string;
  order: 'asc' | 'desc';
}

interface ProductTableProps {
  products: Product[];
  sortConfig: SortConfig;
  onSort: (field: string) => void;
  onDelete?: (product: Product) => void;
  showDelete?: boolean;
}

function SortIcon({ field, sortConfig }: { field: string; sortConfig: SortConfig }) {
  if (sortConfig.sort !== field) {
    return <ArrowUpDown className="ml-1 h-3 w-3 text-[var(--sp-text-warm-mute)]" />;
  }
  return sortConfig.order === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" />
  );
}

export function ProductTable({
  products,
  sortConfig,
  onSort,
  onDelete,
  showDelete = true,
}: ProductTableProps) {
  const router = useRouter();

  if (products.length === 0) {
    return (
      <div className="py-8 text-center text-[var(--sp-text-warm-mute)]">
        商品が見つかりませんでした
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <button type="button" onClick={() => onSort('code')} className="flex items-center">
              商品コード
              <SortIcon field="code" sortConfig={sortConfig} />
            </button>
          </TableHead>
          <TableHead>
            <button type="button" onClick={() => onSort('name')} className="flex items-center">
              商品名
              <SortIcon field="name" sortConfig={sortConfig} />
            </button>
          </TableHead>
          <TableHead>カテゴリー</TableHead>
          <TableHead className="text-right">価格</TableHead>
          <TableHead className="text-right">在庫数</TableHead>
          {showDelete && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => router.push(`/dashboard/products/${product.id}`)}
              >
                {product.code}
              </button>
            </TableCell>
            <TableCell>{product.name}</TableCell>
            <TableCell>
              {(product.category as { name?: string } | undefined)?.name ?? '-'}
            </TableCell>
            <TableCell className="text-right">{formatNumber(product.price)}</TableCell>
            <TableCell className="text-right">{formatNumber(product.stockQuantity)}</TableCell>
            {showDelete && (
              <TableCell>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="削除"
                    onClick={() => onDelete(product)}
                    className="text-[var(--sp-text-warm-mute)] hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
