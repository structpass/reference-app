'use client';

import { useCallback } from 'react';
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
import { Combobox } from '@/components/ui/combobox';
import { ProductSearchModal } from '@/components/shared/product-search-modal';
import { WarehouseField, mapWarehouse } from '@/components/shared/warehouse-field';
import {
  createPlannedActualQtyColumns,
  createProductColumn,
} from '@/components/shared/document-line-columns';
import { useDocumentLines } from '@/hooks/use-document-lines';
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

const mapSupplier = (s: Supplier) => ({ value: String(s.id), label: s.name });

/**
 * 入荷伝票の状態遷移（確定・完了）のボタン定義。view ページの右上アクション行と
 * 伝票フォームの双方が同じ定義を使う（片方だけ文言や確認文がずれないように）。
 */
export function useReceivingStatusActions(doc?: { id: number | string; status: string } | null) {
  const { confirmDocument, complete, transitioning } = useDocumentPage({
    basePath: '/receivings',
    entityName: '入荷',
  });

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
  return { statusActions, transitioning };
}
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
  const { statusActions, transitioning } = useReceivingStatusActions(doc);

  const today = todayISODate();

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

  const {
    lines,
    setLines,
    productSearchOpen,
    setProductSearchOpen,
    openProductSearch,
    handleProductSelect,
    getProductDisplay,
  } = useDocumentLines<ReceivingFormData, ReceivingLineData>({
    setValue,
    field: 'lines',
    initialLines: defaultLines ??
      doc?.lines?.map((l) => ({
        lineNo: l.lineNo,
        productId: l.productId,
        plannedQty: l.plannedQty,
        actualQty: l.actualQty ?? undefined,
      })) ?? [createEmptyLine(1)],
    existingLines: doc?.lines,
  });

  const warehouseId = watch('warehouseId');
  const supplierId = watch('supplierId');

  const handleFormSubmit = handleSubmit((data) => {
    onSubmit?.({ ...data, lines });
  });

  const lineColumns: LineColumn<ReceivingLineData>[] = [
    createProductColumn<ReceivingLineData>(isView, { getProductDisplay, openProductSearch }),
    ...createPlannedActualQtyColumns<ReceivingLineData>(isView),
  ];

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

            <WarehouseField
              isView={isView}
              value={warehouseId}
              options={warehouseOpts}
              error={errors.warehouseId?.message}
              onChange={(val) => setValue('warehouseId', val)}
            />

            <FormField label="仕入先" required={!isView} error={errors.supplierId?.message}>
              {isView ? (
                <Input
                  readOnly
                  disabled
                  value={supplierOpts.find((o) => o.value === String(supplierId))?.label ?? '-'}
                />
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
