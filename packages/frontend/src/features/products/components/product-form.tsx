'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProductStatus } from '@struct-pass/shared';
import type { Category } from '@struct-pass/shared';
import { productSchema, type ProductFormData } from '@/features/products/lib/validations';
import apiClient from '@/lib/api-client';
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
import { Combobox } from '@/components/ui/combobox';
import { ArrowLeft, Pencil, Plus, Save } from 'lucide-react';

const statusOptions = [
  { value: ProductStatus.ACTIVE, label: '有効' },
  { value: ProductStatus.INACTIVE, label: '無効' },
];

export type ProductFormMode = 'create' | 'edit' | 'view';

interface ProductFormProps {
  defaultValues?: Partial<ProductFormData>;
  onSubmit?: (data: ProductFormData) => Promise<void>;
  mode: ProductFormMode;
  id?: string;
  loading?: boolean;
  formId?: string;
  hideActions?: boolean;
}

export function ProductForm({
  defaultValues,
  onSubmit,
  mode,
  id,
  loading,
  formId,
  hideActions,
}: ProductFormProps) {
  const router = useRouter();
  const isView = mode === 'view';
  const [categories, setCategories] = useState<Category[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      categoryId: undefined,
      price: 0,
      purchasePrice: undefined,
      unit: '',
      status: ProductStatus.ACTIVE,
      ...defaultValues,
    } as DefaultValues<ProductFormData>,
  });

  const statusValue = watch('status');
  const categoryIdValue = watch('categoryId');

  useEffect(() => {
    apiClient
      .get<{ data: Category[] }>('/categories', { params: { limit: 100, status: 'ACTIVE' } })
      .then((res) => setCategories(res.data.data))
      .catch(() => setCategories([]));
  }, []);

  return (
    <form
      id={formId}
      onSubmit={onSubmit ? handleSubmit(onSubmit) : (e) => e.preventDefault()}
      onKeyDown={(e) =>
        e.key === 'Enter' && e.target instanceof HTMLInputElement && e.preventDefault()
      }
      className="w-full space-y-6 md:max-w-lg"
    >
      <FormField label="商品コード" required={!isView} error={errors.code?.message} htmlFor="code">
        <Input id="code" disabled={isView || mode === 'edit'} {...register('code')} />
      </FormField>

      <FormField label="商品名" required={!isView} error={errors.name?.message} htmlFor="name">
        <Input id="name" disabled={isView} {...register('name')} />
      </FormField>

      <FormField label="商品説明" error={errors.description?.message} htmlFor="description">
        <Textarea id="description" disabled={isView} {...register('description')} />
      </FormField>

      <FormField label="カテゴリー" required={!isView} error={errors.categoryId?.message}>
        <Combobox
          value={categoryIdValue ? String(categoryIdValue) : ''}
          onValueChange={(val) => setValue('categoryId', Number(val))}
          options={categories.map((cat) => ({ value: String(cat.id), label: cat.name }))}
          searchPlaceholder="カテゴリーを検索..."
          disabled={isView}
          className="w-full"
        />
      </FormField>

      <FormField label="価格" required={!isView} error={errors.price?.message} htmlFor="price">
        <Input
          id="price"
          type="number"
          min="0"
          step="1"
          disabled={isView}
          {...register('price', { valueAsNumber: true })}
        />
      </FormField>

      <FormField label="仕入価格" error={errors.purchasePrice?.message} htmlFor="purchasePrice">
        <Input
          id="purchasePrice"
          type="number"
          min="0"
          step="1"
          disabled={isView}
          {...register('purchasePrice', { valueAsNumber: true })}
        />
      </FormField>

      <FormField label="単位" error={errors.unit?.message} htmlFor="unit">
        <Input id="unit" disabled={isView} {...register('unit')} />
      </FormField>

      <FormField label="ステータス" error={errors.status?.message}>
        <Select
          value={statusValue}
          onValueChange={(val) => setValue('status', val as ProductStatus)}
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
              <Button type="button" onClick={() => router.push(`/dashboard/products/${id}`)}>
                <Pencil className="mr-1 h-4 w-4" />
                編集
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.back()}>
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
                onClick={() => router.push('/dashboard/products')}
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
