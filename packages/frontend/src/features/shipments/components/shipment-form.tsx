'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { ProductLineCell } from '@/components/shared/product-line-cell';
import { useProductLineSelection } from '@/hooks/use-product-line-selection';
import { ProductSearchModal } from '@/components/shared/product-search-modal';
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

const mapWarehouse = (w: Warehouse) => ({ value: String(w.id), label: w.name });
const mapCarrier = (c: Carrier) => ({ value: String(c.id), label: c.name });

function createEmptyLine(lineNo: number): ShipmentLineData {
  return { lineNo, productId: '', plannedQty: 1 };
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
  const { confirmDocument, ship, transitioning } = useDocumentPage({
    basePath: '/shipments',
    entityName: '出荷',
  });

  const today = todayISODate();
  const [lines, setLines] = useState<ShipmentLineData[]>(
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

  const warehouseId = watch('warehouseId');
  const carrierId = watch('carrierId');

  useEffect(() => {
    setValue('lines', lines);
  }, [lines, setValue]);

  const handleFormSubmit = handleSubmit((data) => {
    onSubmit?.({ ...data, lines });
  });

  const lineColumns: LineColumn<ShipmentLineData>[] = [
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
                <span className="text-sm">
                  {carrierOpts.find((o) => o.value === String(carrierId))?.label ?? '-'}
                </span>
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
