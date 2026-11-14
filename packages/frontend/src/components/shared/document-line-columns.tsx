'use client';

import type { LineColumn } from '@/components/shared/line-items-table';
import { ProductLineCell } from '@/components/shared/product-line-cell';
import { Input } from '@/components/ui/input';

interface ProductColumnContext {
  getProductDisplay: (productId: string) => string;
  openProductSearch: (index: number) => void;
}

/** 商品選択セルの列。入荷・出荷・棚卸で同じ列定義を使う。 */
export function createProductColumn<TLine extends { productId: string }>(
  isView: boolean,
  { getProductDisplay, openProductSearch }: ProductColumnContext,
  width = '40%',
): LineColumn<TLine> {
  return {
    key: 'productId',
    label: '商品',
    width,
    render: (line, index) => (
      <ProductLineCell
        isView={isView}
        productId={line.productId}
        getProductDisplay={getProductDisplay}
        onSearch={() => openProductSearch(index)}
      />
    ),
  };
}

interface PlannedActualLine {
  plannedQty: number;
  actualQty?: number;
}

/** 予定数量・実績数量の列。入荷と出荷で同じ列定義を使う。 */
export function createPlannedActualQtyColumns<TLine extends PlannedActualLine>(
  isView: boolean,
): LineColumn<TLine>[] {
  return [
    {
      key: 'plannedQty',
      label: '予定数量',
      width: '20%',
      render: (line, index, onChange) =>
        isView ? (
          <span>{line.plannedQty}</span>
        ) : (
          <Input
            type="number"
            min={1}
            value={line.plannedQty}
            onChange={(e) =>
              onChange(index, { ...line, plannedQty: Number(e.target.value) || 0 } as TLine)
            }
          />
        ),
    },
    {
      key: 'actualQty',
      label: '実績数量',
      width: '20%',
      render: (line, index, onChange) =>
        isView ? (
          <span>{line.actualQty ?? '-'}</span>
        ) : (
          <Input
            type="number"
            min={0}
            value={line.actualQty ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : Number(e.target.value);
              onChange(index, { ...line, actualQty: val } as TLine);
            }}
          />
        ),
    },
  ];
}
