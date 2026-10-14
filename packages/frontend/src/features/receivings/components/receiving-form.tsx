'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Receiving, ReceivingLine, Warehouse, Supplier } from '@struct-pass/shared';
import {
  receivingSchema,
  type ReceivingFormData,
  type ReceivingLineData,
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
import { Combobox } from '@/components/ui/combobox';
import { ProductLineCell } from '@/components/shared/product-line-cell';
import { useProductLineSelection } from '@/hooks/use-product-line-selection';
import { ProductSearchModal } from '@/components/shared/product-search-modal';
import { useSelectOptions } from '@/hooks/use-select-options';
import { useDocumentPage } from '@/hooks/use-document-page';
import { formatISODate, todayISODate } from '@/lib/utils';

interface ReceivingFormProps {
  mode: DocumentFormMode;
  defaultValues?: Partial<ReceivingFormData>;
  defaultLines?: ReceivingLineData[];
  document?: Receiving & {
    lines?: (ReceivingLine & { product?: { id: string; name: string; code: string } })[];
  };
  onSubmit?: (data: ReceivingFormData) => Promise<void>;
  submitting?: boolean;
  formId?: string;
  hideActions?: boolean;
}

const mapWarehouse = (w: Warehouse) => ({ value: String(w.id), label: w.name });
const mapSupplier = (s: Supplier) => ({ value: String(s.id), label: s.name });

function createEmptyLine(lineNo: number): ReceivingLineData {
  return { lineNo, productId: '', plannedQty: 1 };
}

export function ReceivingForm({
  mode,
  defaultValues,
  defaultLines,
  document: doc,
  onSubmit,
  submitting,
  formId,
  hideActions,
}: ReceivingFormProps) {
  const isView = mode === 'view';
  const { options: warehouseOpts } = useSelectOptions<Warehouse>(
    '/warehouses',
    useCallback(mapWarehouse, []),
  );
  const { options: supplierOpts } = useSelectOptions<Supplier>(
    '/suppliers',
    useCallback(mapSupplier, []),
  );
  const { confirmDocument, complete, transitioning } = useDocumentPage({
    basePath: '/receivings',
    entityName: '入荷',
  });

  const today = todayISODate();
  const [lines, setLines] = useState<ReceivingLineData[]>(
    defaultLines ??
      doc?.lines?.map((l) => ({
        lineNo: l.lineNo,
        productId: l.productId,
        plannedQty: l.plannedQty,
        actualQty: l.actualQty ?? undefined,
      })) ?? [createEmptyLine(1)],
  );

  const {
    productSearchOpen,
    setProductSearchOpen,
    openProductSearch,
    handleProductSelect,
    getProductDisplay,
  } = useProductLineSelection(setLines, doc?.lines);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ReceivingFormData>({
    resolver: zodResolver(receivingSchema),
    defaultValues: {
      receivingDate: today,
      warehouseId: 0,
      supplierId: 0,
      lines: [],
      ...defaultValues,
      ...(doc
        ? {
            receivingDate: formatISODate(doc.receivingDate),
            warehouseId: doc.warehouseId,
            supplierId: doc.supplierId,
          }
        : {}),
    },
  });

  const warehouseId = watch('warehouseId');
  const supplierId = watch('supplierId');

  useEffect(() => {
    setValue('lines', lines);
  }, [lines, setValue]);

  const handleFormSubmit = handleSubmit((data) => {
    onSubmit?.({ ...data, lines });
  });

  const lineColumns: LineColumn<ReceivingLineData>[] = [
    {
      key: 'productId',
      label: '商品',
      width: '40%',
      render: (line, index) => (
        <ProductLineCell
          isView={isView}
          productId={line.productId}
          getProductDisplay={getProductDisplay}
          onSearch={() => openProductSearch(index)}
        />
      ),
    },
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
            onChange={(e) => onChange(index, { ...line, plannedQty: Number(e.target.value) || 0 })}
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
              onChange(index, { ...line, actualQty: val });
            }}
          />
        ),
    },
  ];

  const statusActions: StatusAction[] = [];
  if (doc?.status === 'DRAFT') {
    statusActions.push({
      label: '確定する',
      onAction: () => confirmDocument(doc.id),
      confirmTitle: '入荷を確定',
      confirmDescription: '入荷を確定すると在庫が加算されます。よろしいですか？',
    });
  }
  if (doc?.status === 'CONFIRMED') {
    statusActions.push({
      label: '完了する',
      onAction: () => complete(doc.id),
      confirmTitle: '入荷を完了',
      confirmDescription: '入荷を完了にしますか？',
    });
  }

  return (
    <>
      <DocumentForm
        mode={mode}
        documentNo={doc?.receivingNo}
        status={doc?.status}
        backPath="/dashboard/receivings"
        editPath={doc ? `/dashboard/receivings/${doc.id}` : undefined}
        onSubmit={!isView ? handleFormSubmit : undefined}
        submitting={submitting}
        statusActions={statusActions}
        transitioning={transitioning}
        formId={formId}
        hideActions={hideActions}
        submitLabel={{ create: '入荷登録', edit: '入荷更新' }}
        headerFields={
          <>
            <FormField
              label="入荷日"
              required={!isView}
              error={errors.receivingDate?.message}
              htmlFor="receivingDate"
            >
              <Input
                id="receivingDate"
                type="date"
                disabled={isView}
                {...register('receivingDate')}
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
          </>
        }
        lineItemsNode={
          <LineItemsTable
            lines={lines}
            columns={lineColumns}
            onChange={setLines}
            createEmptyLine={createEmptyLine}
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
