'use client';

import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Shipment, ShipmentLine, Warehouse, Carrier } from '@struct-pass/shared';
import { shipmentSchema, type ShipmentFormData, type ShipmentLineData } from '../lib/validations';
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

interface ShipmentFormProps {
  mode: DocumentFormMode;
  defaultValues?: Partial<ShipmentFormData>;
  defaultLines?: ShipmentLineData[];
  document?: Shipment & {
    lines?: (ShipmentLine & { product?: { id: string; name: string; code: string } })[];
  };
  onSubmit?: (data: ShipmentFormData) => Promise<void>;
  submitting?: boolean;
  formId?: string;
  hideActions?: boolean;
}

const mapCarrier = (c: Carrier) => ({ value: String(c.id), label: c.name });

function createEmptyLine(lineNo: number): ShipmentLineData {
  return { lineNo, productId: '', plannedQty: 1 };
}

/**
 * 出荷伝票の状態遷移（確定・出荷完了）のボタン定義。view ページの右上アクション行と
 * 伝票フォームの双方が同じ定義を使う。
 */
export function useShipmentStatusActions(doc?: { id: number | string; status: string } | null) {
  const { confirmDocument, ship, transitioning } = useDocumentPage({
    basePath: '/shipments',
    entityName: '出荷',
  });

  const statusActions: StatusAction[] = [];
  if (doc?.status === 'DRAFT') {
    statusActions.push({
      label: '確定する',
      onAction: () => confirmDocument(doc.id),
      confirmTitle: '出荷を確定',
      confirmDescription: '出荷を確定すると在庫が減算されます。よろしいですか？',
    });
  }
  if (doc?.status === 'CONFIRMED') {
    statusActions.push({
      label: '出荷完了',
      onAction: () => ship(doc.id),
      confirmTitle: '出荷完了',
      confirmDescription: '出荷を完了にしますか？',
    });
  }
  return { statusActions, transitioning };
}

export function ShipmentForm({
  mode,
  defaultValues,
  defaultLines,
  document: doc,
  onSubmit,
  submitting,
  formId,
  hideActions,
}: ShipmentFormProps) {
  const isView = mode === 'view';
  const { options: warehouseOpts } = useSelectOptions<Warehouse>(
    '/warehouses',
    useCallback(mapWarehouse, []),
  );
  const { options: carrierOpts } = useSelectOptions<Carrier>(
    '/carriers',
    useCallback(mapCarrier, []),
  );
  const { statusActions, transitioning } = useShipmentStatusActions(doc);

  const today = todayISODate();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ShipmentFormData>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: {
      shipmentDate: today,
      warehouseId: 0,
      destination: '',
      lines: [],
      ...defaultValues,
      ...(doc
        ? {
            shipmentDate: formatISODate(doc.shipmentDate),
            warehouseId: doc.warehouseId,
            destination: doc.destination,
            carrierId: doc.carrierId ?? undefined,
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
  } = useDocumentLines<ShipmentFormData, ShipmentLineData>({
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
  const carrierId = watch('carrierId');

  const handleFormSubmit = handleSubmit((data) => {
    onSubmit?.({ ...data, lines });
  });

  const lineColumns: LineColumn<ShipmentLineData>[] = [
    createProductColumn<ShipmentLineData>(isView, { getProductDisplay, openProductSearch }),
    ...createPlannedActualQtyColumns<ShipmentLineData>(isView),
  ];

  return (
    <>
      <DocumentForm
        mode={mode}
        documentNo={doc?.shipmentNo}
        status={doc?.status}
        backPath="/dashboard/shipments"
        editPath={doc ? `/dashboard/shipments/${doc.id}` : undefined}
        onSubmit={!isView ? handleFormSubmit : undefined}
        submitting={submitting}
        statusActions={statusActions}
        transitioning={transitioning}
        formId={formId}
        hideActions={hideActions}
        submitLabel={{ create: '出荷登録', edit: '出荷更新' }}
        headerFields={
          <>
            <FormField
              label="出荷日"
              required={!isView}
              error={errors.shipmentDate?.message}
              htmlFor="shipmentDate"
            >
              <Input
                id="shipmentDate"
                type="date"
                disabled={isView}
                {...register('shipmentDate')}
              />
            </FormField>

            <WarehouseField
              isView={isView}
              value={warehouseId}
              options={warehouseOpts}
              error={errors.warehouseId?.message}
              onChange={(val) => setValue('warehouseId', val)}
            />

            <FormField
              label="出荷先"
              required={!isView}
              error={errors.destination?.message}
              htmlFor="destination"
            >
              <Input id="destination" disabled={isView} {...register('destination')} />
            </FormField>

            <FormField label="運送会社" error={errors.carrierId?.message}>
              {isView ? (
                <Input
                  readOnly
                  disabled
                  value={carrierOpts.find((o) => o.value === String(carrierId))?.label ?? '-'}
                />
              ) : (
                <Select
                  value={carrierId ? String(carrierId) : ''}
                  onValueChange={(val) => setValue('carrierId', val ? Number(val) : undefined)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="運送会社を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {carrierOpts.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
