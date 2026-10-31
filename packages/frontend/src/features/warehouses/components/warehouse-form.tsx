'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ActiveStatus } from '@struct-pass/shared';
import { warehouseSchema, type WarehouseFormData } from '../lib/validations';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Pencil, Plus, Save } from 'lucide-react';

const statusOptions = [
  { value: ActiveStatus.ACTIVE, label: '有効' },
  { value: ActiveStatus.INACTIVE, label: '無効' },
];

export type WarehouseFormMode = 'create' | 'edit' | 'view';

interface WarehouseFormProps {
  defaultValues?: Partial<WarehouseFormData>;
  onSubmit?: (data: WarehouseFormData) => Promise<void>;
  mode: WarehouseFormMode;
  id?: string | number;
  loading?: boolean;
  formId?: string;
  hideActions?: boolean;
}

export function WarehouseForm({
  defaultValues,
  onSubmit,
  mode,
  id,
  loading,
  formId,
  hideActions,
}: WarehouseFormProps) {
  const router = useRouter();
  const isView = mode === 'view';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<WarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      code: '',
      name: '',
      address: '',
      phone: '',
      manager: '',
      capacity: undefined,
      status: ActiveStatus.ACTIVE,
      ...defaultValues,
    },
  });

  const statusValue = watch('status');

  return (
    <form
      id={formId}
      onSubmit={onSubmit ? handleSubmit(onSubmit) : (e) => e.preventDefault()}
      onKeyDown={(e) =>
        e.key === 'Enter' && e.target instanceof HTMLInputElement && e.preventDefault()
      }
      className="w-full space-y-6 md:max-w-lg"
    >
      <FormField label="倉庫コード" required={!isView} error={errors.code?.message} htmlFor="code">
        <Input id="code" disabled={isView || mode === 'edit'} {...register('code')} />
      </FormField>

      <FormField label="倉庫名" required={!isView} error={errors.name?.message} htmlFor="name">
        <Input id="name" disabled={isView} {...register('name')} />
      </FormField>

      <FormField label="住所" error={errors.address?.message} htmlFor="address">
        <Textarea id="address" disabled={isView} {...register('address')} />
      </FormField>

      <FormField label="電話番号" error={errors.phone?.message} htmlFor="phone">
        <Input id="phone" disabled={isView} {...register('phone')} />
      </FormField>

      <FormField label="管理者" error={errors.manager?.message} htmlFor="manager">
        <Input id="manager" disabled={isView} {...register('manager')} />
      </FormField>

      <FormField label="容量" error={errors.capacity?.message} htmlFor="capacity">
        <Input
          id="capacity"
          type="number"
          min="0"
          step="1"
          disabled={isView}
          {...register('capacity', { valueAsNumber: true })}
        />
      </FormField>

      <FormField label="ステータス" error={errors.status?.message}>
        <Select
          value={statusValue}
          onValueChange={(val) => setValue('status', val as WarehouseFormData['status'])}
          disabled={isView}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="ステータスを選択" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {!hideActions && (
        <div className="flex gap-4 pt-4">
          {isView ? (
            <>
              <Button
                type="button"
                variant="sp-action"
                onClick={() => router.push(`/dashboard/warehouses/${id}`)}
              >
                <Pencil className="mr-1 h-4 w-4" />
                編集
              </Button>
              <Button type="button" variant="sp-action" onClick={() => router.back()}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                戻る
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" variant="sp-action" loading={loading}>
                {mode === 'edit' ? (
                  <Save className="mr-1 h-4 w-4" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                {mode === 'edit' ? 'マスタ更新' : 'マスタ登録'}
              </Button>
              <Button
                type="button"
                variant="sp-action"
                onClick={() => router.push('/dashboard/warehouses')}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                一覧へ戻る
              </Button>
            </>
          )}
        </div>
      )}
    </form>
  );
}
