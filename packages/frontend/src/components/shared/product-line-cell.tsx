'use client';

import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProductLineCellProps {
  isView: boolean;
  productId: string;
  getProductDisplay: (productId: string) => string;
  onSearch: () => void;
}

export function ProductLineCell({
  isView,
  productId,
  getProductDisplay,
  onSearch,
}: ProductLineCellProps) {
  return isView ? (
    <span>{getProductDisplay(productId)}</span>
  ) : (
    <div className="flex items-center gap-1">
      <span className="flex-1 truncate text-sm">
        {productId ? (
          getProductDisplay(productId)
        ) : (
          <span className="text-muted-foreground/60">商品を選択</span>
        )}
      </span>
      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onSearch}>
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}
