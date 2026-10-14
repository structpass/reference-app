'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Stocktaking, StocktakingItem, Warehouse } from '@struct-pass/shared';
import {
  stocktakingSchema,
  type StocktakingFormData,
  type StocktakingItemData,
} from '../lib/validations';
import {
  DocumentForm,
  type DocumentFormMode,
  type StatusAction,
} from '@/components/shared/document-form';
import { LineItemsTable, type LineColumn } from '@/components/shared/line-items-table';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductLineCell } from '@/components/shared/product-line-cell';
import { useProductLineSelection } from '@/hooks/use-product-line-selection';
import { ProductSearchModal } from '@/components/shared/product-search-modal';
import { useSelectOptions } from '@/hooks/use-select-options';
import { useDocumentPage } from '@/hooks/use-document-page';
import { formatISODate, todayISODate } from '@/lib/utils';

type StocktakingItemWithLineNo = StocktakingItemData & { lineNo: number };

interface StocktakingFormProps {
  mode: DocumentFormMode;
  document?: Stocktaking & {
    items?: (StocktakingItem & { product?: { id: string; name: string; code: string } })[];
  };
  onSubmit?: (data: StocktakingFormData) => Promise<void>;
  submitting?: boolean;
  formId?: string;
  hideActions?: boolean;
}

const mapWarehouse = (w: Warehouse) => ({ value: String(w.id), label: w.name });

function createEmptyItem(lineNo: number): StocktakingItemWithLineNo {
  return { lineNo, productId: '', theoreticalQty: 0 };
}

function DifferenceCell({ item }: { item: StocktakingItemWithLineNo }) {
  if (item.actualQty == null) return <span className="text-[var(--sp-text-warm-mute)]">-</span>;
  const diff = item.actualQty - item.theoreticalQty;
  if (diff > 0) return <span className="font-medium text-success">+{diff}</span>;
  if (diff < 0) return <span className="font-medium text-destructive">{diff}</span>;
  return <span>0</span>;
}

export function StocktakingForm({
  mode,
  document: doc,
  onSubmit,
  submitting,
  formId,
  hideActions,
}: StocktakingFormProps) {
  const isView = mode === 'view';
  const { options: warehouseOpts } = useSelectOptions<Warehouse>(
    '/warehouses',
    useCallback(mapWarehouse, []),
  );
  const { confirmDocument, transitioning } = useDocumentPage({
    basePath: '/stocktakings',
    entityName: '棚卸',
  });

  const today = todayISODate();
  const [items, setItems] = useState<StocktakingItemWithLineNo[]>(
    doc?.items?.map((it, idx) => ({
      lineNo: idx + 1,
      productId: it.productId,
      theoreticalQty: it.theoreticalQty,
      actualQty: it.actualQty ?? undefined,
      differenceReason: it.differenceReason ?? undefined,
    })) ?? [createEmptyItem(1)],
  );

  const {
    productSearchOpen,
    setProductSearchOpen,
    openProductSearch,
    handleProductSelect,
    getProductDisplay,
  } = useProductLineSelection(setItems, doc?.items);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StocktakingFormData>({
    resolver: zodResolver(stocktakingSchema),
    defaultValues: {
      stocktakingDate: today,
      warehouseId: 0,
      stocktaker: '',
      items: [],
      ...(doc
        ? {
            stocktakingDate: formatISODate(doc.stocktakingDate),
            warehouseId: doc.warehouseId,
            stocktaker: doc.stocktaker ?? '',
          }
        : {}),
    },
  });

  const warehouseId = watch('warehouseId');

  useEffect(() => {
    setValue('items', items);
  }, [items, setValue]);

  const handleFormSubmit = handleSubmit((data) => {
    const cleanItems = items.map(({ lineNo: _lineNo, ...rest }) => rest);
    onSubmit?.({ ...data, items: cleanItems });
  });

  const itemColumns: LineColumn<StocktakingItemWithLineNo>[] = [
    {
      key: 'productId',
      label: '商品',
      width: '30%',
      render: (item, index) => (
        <ProductLineCell
          isView={isView}
          productId={item.productId}
          getProductDisplay={getProductDisplay}
          onSearch={() => openProductSearch(index)}
        />
      ),
    },
    {
      key: 'theoreticalQty',
      label: '理論在庫',
      width: '13%',
      render: (item, index, onChange) =>
        isView ? (
          <span>{item.theoreticalQty}</span>
        ) : (
          <Input
            type="number"
            min={0}
            value={item.theoreticalQty}
            onChange={(e) =>
              onChange(index, { ...item, theoreticalQty: Number(e.target.value) || 0 })
            }
          />
        ),
    },
    {
      key: 'actualQty',
      label: '実数量',
      width: '13%',
      render: (item, index, onChange) =>
        isView ? (
          <span>{item.actualQty ?? '-'}</span>
        ) : (
          <Input
            type="number"
            min={0}
            value={item.actualQty ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : Number(e.target.value);
              onChange(index, { ...item, actualQty: val });
            }}
          />
        ),
    },
    {
      key: 'difference',
      label: '差異',
      width: '10%',
      render: (item) => <DifferenceCell item={item} />,
    },
    {
      key: 'differenceReason',
      label: '差異理由',
      width: '20%',
      render: (item, index, onChange) =>
        isView ? (
          <span>{item.differenceReason || '-'}</span>
        ) : (
          <Input
            value={item.differenceReason ?? ''}
            onChange={(e) =>
              onChange(index, { ...item, differenceReason: e.target.value || undefined })
            }
          />
        ),
    },
  ];

  const statusActions: StatusAction[] = [];
  if (doc?.status === 'DRAFT') {
    statusActions.push({
      label: '確定する',
      onAction: () => confirmDocument(doc.id),
      confirmTitle: '棚卸を確定',
      confirmDescription: '棚卸を確定すると在庫が実数量で上書きされます。よろしいですか？',
    });
  }

  return (
    <>
      <DocumentForm
        mode={mode}
        documentNo={doc ? `棚卸 #${doc.id}` : undefined}
        status={doc?.status}
        backPath="/dashboard/stocktakings"
        editPath={doc ? `/dashboard/stocktakings/${doc.id}` : undefined}
        onSubmit={!isView ? handleFormSubmit : undefined}
        submitting={submitting}
        statusActions={statusActions}
        transitioning={transitioning}
        formId={formId}
        hideActions={hideActions}
        submitLabel={{ create: '棚卸登録', edit: '棚卸更新' }}
        headerFields={
          <>
            <FormField
              label="棚卸日"
              required={!isView}
              error={errors.stocktakingDate?.message}
              htmlFor="stocktakingDate"
            >
              <Input
                id="stocktakingDate"
                type="date"
                disabled={isView}
                {...register('stocktakingDate')}
              />
            </FormField>

            <FormField label="倉庫" required={!isView} error={errors.warehouseId?.message}>
              {isView ? (
                <span className="text-sm">
                  {warehouseOpts.find((o) => o.value === String(warehouseId))?.label ?? '-'}
                </span>
              ) : (
                <Select
                  value={warehouseId ? String(warehouseId) : ''}
                  onValueChange={(val) => setValue('warehouseId', Number(val))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="倉庫を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouseOpts.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField label="棚卸担当者" error={errors.stocktaker?.message} htmlFor="stocktaker">
              <Input id="stocktaker" disabled={isView} {...register('stocktaker')} />
            </FormField>
          </>
        }
        lineItemsNode={
          <LineItemsTable
            lines={items}
            columns={itemColumns}
            onChange={setItems}
            createEmptyLine={createEmptyItem}
            readonly={isView}
          />
        }
      />
      <ProductSearchModal
        open={productSearchOpen}
        onClose={() => setProductSearchOpen(false)}
        onSelect={handleProductSelect}
      />
    </>
  );
}
