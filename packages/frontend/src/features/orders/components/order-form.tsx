'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Order, OrderItem, Supplier } from '@struct-pass/shared';
import { orderSchema, type OrderFormData, type OrderItemData } from '../lib/validations';
import {
  DocumentForm,
  type DocumentFormMode,
  type StatusAction,
} from '@/components/shared/document-form';
import { LineItemsTable, type LineColumn } from '@/components/shared/line-items-table';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { ProductLineCell } from '@/components/shared/product-line-cell';
import { useProductLineSelection } from '@/hooks/use-product-line-selection';
import { ProductSearchModal } from '@/components/shared/product-search-modal';
import { useSelectOptions } from '@/hooks/use-select-options';
import { useDocumentPage } from '@/hooks/use-document-page';
import { formatISODate, todayISODate, formatNumber } from '@/lib/utils';

interface OrderFormProps {
  mode: DocumentFormMode;
  defaultValues?: Partial<OrderFormData>;
  defaultItems?: OrderItemData[];
  document?: Order & {
    items?: (OrderItem & { product?: { id: string; name: string; code: string } })[];
  };
  onSubmit?: (data: OrderFormData) => Promise<void>;
  submitting?: boolean;
  formId?: string;
  hideActions?: boolean;
}

const mapSupplier = (s: Supplier) => ({ value: String(s.id), label: s.name });

function createEmptyItem(lineNo: number): OrderItemData {
  return { lineNo, productId: '', orderQty: 1, unitPrice: 0 };
}

export function OrderForm({
  mode,
  defaultValues,
  defaultItems,
  document: doc,
  onSubmit,
  submitting,
  formId,
  hideActions,
}: OrderFormProps) {
  const isView = mode === 'view';
  const { options: supplierOpts } = useSelectOptions<Supplier>(
    '/suppliers',
    useCallback(mapSupplier, []),
  );
  const { confirmDocument, transitioning } = useDocumentPage({
    basePath: '/orders',
    entityName: '発注',
  });

  const today = todayISODate();
  const [items, setItems] = useState<OrderItemData[]>(
    defaultItems ??
      doc?.items?.map((it) => ({
        lineNo: it.lineNo,
        productId: it.productId,
        orderQty: it.orderQty,
        unitPrice: it.unitPrice,
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
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      orderDate: today,
      supplierId: 0,
      items: [],
      ...defaultValues,
      ...(doc
        ? {
            orderDate: formatISODate(doc.orderDate),
            supplierId: doc.supplierId,
            desiredDeliveryDate: doc.desiredDeliveryDate
              ? formatISODate(doc.desiredDeliveryDate)
              : undefined,
          }
        : {}),
    },
  });

  const supplierId = watch('supplierId');

  useEffect(() => {
    setValue('items', items);
  }, [items, setValue]);

  const handleFormSubmit = handleSubmit((data) => {
    onSubmit?.({ ...data, items });
  });

  const totalAmount = useMemo(
    () => items.reduce((sum, it) => sum + it.orderQty * it.unitPrice, 0),
    [items],
  );

  const lineColumns: LineColumn<OrderItemData>[] = [
    {
      key: 'productId',
      label: '商品',
      width: '35%',
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
      key: 'orderQty',
      label: '発注数量',
      width: '15%',
      render: (item, index, onChange) =>
        isView ? (
          <span>{item.orderQty}</span>
        ) : (
          <Input
            type="number"
            min={1}
            value={item.orderQty}
            onChange={(e) => onChange(index, { ...item, orderQty: Number(e.target.value) || 0 })}
          />
        ),
    },
    {
      key: 'unitPrice',
      label: '単価',
      width: '15%',
      render: (item, index, onChange) =>
        isView ? (
          <span>{formatNumber(item.unitPrice)}</span>
        ) : (
          <Input
            type="number"
            min={0}
            step="0.01"
            value={item.unitPrice}
            onChange={(e) => onChange(index, { ...item, unitPrice: Number(e.target.value) || 0 })}
          />
        ),
    },
    {
      key: 'amount',
      label: '金額',
      width: '15%',
      render: (item) => <span>{formatNumber(item.orderQty * item.unitPrice)}</span>,
    },
  ];

  const statusActions: StatusAction[] = [];
  if (doc?.status === 'DRAFT') {
    statusActions.push({
      label: '発注確定',
      onAction: () => confirmDocument(doc.id),
      confirmTitle: '発注を確定',
      confirmDescription: '発注を確定しますか？',
    });
  }

  return (
    <>
      <DocumentForm
        mode={mode}
        documentNo={doc?.orderNo}
        status={doc?.status}
        backPath="/dashboard/orders"
        editPath={doc ? `/dashboard/orders/${doc.id}` : undefined}
        onSubmit={!isView ? handleFormSubmit : undefined}
        submitting={submitting}
        statusActions={statusActions}
        transitioning={transitioning}
        formId={formId}
        hideActions={hideActions}
        submitLabel={{ create: '発注登録', edit: '発注更新' }}
        headerFields={
          <>
            <FormField
              label="発注日"
              required={!isView}
              error={errors.orderDate?.message}
              htmlFor="orderDate"
            >
              <Input id="orderDate" type="date" disabled={isView} {...register('orderDate')} />
            </FormField>

            <FormField label="仕入先" required={!isView} error={errors.supplierId?.message}>
              {isView ? (
                <span className="text-sm">
                  {supplierOpts.find((o) => o.value === String(supplierId))?.label ?? '-'}
                </span>
              ) : (
                <Combobox
                  value={supplierId ? String(supplierId) : ''}
                  onValueChange={(val) => setValue('supplierId', Number(val))}
                  options={supplierOpts}
                  searchPlaceholder="仕入先を検索..."
                />
              )}
            </FormField>

            <FormField
              label="希望納期"
              error={errors.desiredDeliveryDate?.message}
              htmlFor="desiredDeliveryDate"
            >
              <Input
                id="desiredDeliveryDate"
                type="date"
                disabled={isView}
                {...register('desiredDeliveryDate')}
              />
            </FormField>
          </>
        }
        lineItemsNode={
          <LineItemsTable
            lines={items}
            columns={lineColumns}
            onChange={setItems}
            createEmptyLine={createEmptyItem}
            readonly={isView}
            summary={
              <>
                <td
                  colSpan={3}
                  className="px-3 py-2 text-right font-medium text-[var(--sp-text-warm)]"
                >
                  合計
                </td>
                <td className="px-3 py-2 font-semibold text-[var(--sp-text-warm)]">
                  {formatNumber(totalAmount)}
                </td>
                {!isView && <td />}
              </>
            }
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
