'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ActiveStatus } from '@struct-pass/shared';
import { categorySchema, type CategoryFormData } from '../lib/validations';
import { Input } from '@/components/ui/input';
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

export type CategoryFormMode = 'create' | 'edit' | 'view';

interface CategoryFormProps {
  defaultValues?: Partial<CategoryFormData>;
  onSubmit?: (data: CategoryFormData) => Promise<void>;
  mode: CategoryFormMode;
  id?: string | number;
  loading?: boolean;
  formId?: string;
  hideActions?: boolean;
}

export function CategoryForm({
  defaultValues,
  onSubmit,
  mode,
  id,
  loading,
  formId,
  hideActions,
}: CategoryFormProps) {
  const router = useRouter();
  const isView = mode === 'view';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      code: '',
      name: '',
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
      <FormField
        label="カテゴリーコード"
        required={!isView}
        error={errors.code?.message}
        htmlFor="code"
      >
        <Input id="code" disabled={isView || mode === 'edit'} {...register('code')} />
      </FormField>

      <FormField
        label="カテゴリー名"
        required={!isView}
        error={errors.name?.message}
        htmlFor="name"
      >
        <Input id="name" disabled={isView} {...register('name')} />
      </FormField>

      <FormField label="ステータス" error={errors.status?.message}>
        <Select
          value={statusValue}
          onValueChange={(val) => setValue('status', val as CategoryFormData['status'])}
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
                onClick={() => router.push(`/dashboard/categories/${id}`)}
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
                onClick={() => router.push('/dashboard/categories')}
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
