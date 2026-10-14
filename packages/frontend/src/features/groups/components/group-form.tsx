'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ActiveStatus, UserRole } from '@struct-pass/shared';
import { getRoleLabel } from '@/lib/role-utils';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { selectableGroupRoles } from '../lib/group-role-scope';
import { groupSchema, type GroupFormData } from '../lib/validations';
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

export type GroupFormMode = 'create' | 'edit' | 'view';

interface GroupFormProps {
  defaultValues?: Partial<GroupFormData>;
  onSubmit?: (data: GroupFormData) => Promise<void>;
  mode: GroupFormMode;
  id?: string | number;
  loading?: boolean;
  formId?: string;
  hideActions?: boolean;
}

export function GroupForm({
  defaultValues,
  onSubmit,
  mode,
  id,
  loading,
  formId,
  hideActions,
}: GroupFormProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const isView = mode === 'view';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<GroupFormData>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      status: ActiveStatus.ACTIVE,
      ...defaultValues,
    },
  });

  const roleValue = watch('role');
  const statusValue = watch('status');

  // v2-427: 選ぶと保存時に必ず 403 になる role（SYS_ADMIN と、担当系統の異なるロール）を
  // 選択肢から外す。判定は backend と同じ基準（`group-role-scope.ts`）で行い、呼び出し元の
  // ロールで絞る。編集中のグループの現在値は、選択肢に無くても表示を保つため先頭に残す。
  const currentRole = (defaultValues?.role ?? roleValue) as UserRole | undefined;
  const roleOptions = selectableGroupRoles(currentUser?.role, {
    currentRole: mode === 'edit' || isView ? currentRole : undefined,
  }).map((r) => ({
    value: r,
    label: getRoleLabel(r),
  }));

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
        label="グループコード"
        required={!isView}
        error={errors.code?.message}
        htmlFor="code"
      >
        <Input id="code" disabled={isView || mode === 'edit'} {...register('code')} />
      </FormField>

      <FormField label="グループ名" required={!isView} error={errors.name?.message} htmlFor="name">
        <Input id="name" disabled={isView} {...register('name')} />
      </FormField>

      <FormField label="説明" error={errors.description?.message} htmlFor="description">
        <Textarea id="description" disabled={isView} {...register('description')} />
      </FormField>

      <FormField label="ロール" required={!isView} error={errors.role?.message}>
        <Select
          value={roleValue || ''}
          onValueChange={(val) => setValue('role', val as GroupFormData['role'])}
          disabled={isView}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="ロールを選択" />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="ステータス" error={errors.status?.message}>
        <Select
          value={statusValue}
          onValueChange={(val) => setValue('status', val as GroupFormData['status'])}
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
                onClick={() => router.push(`/dashboard/groups/${id}`)}
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
                onClick={() => router.push('/dashboard/groups')}
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
