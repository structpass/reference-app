'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserRole, ActiveStatus } from '@struct-pass/shared';
import {
  userCreateSchema,
  userEditSchema,
  PENDING_ROLE_VALUE,
  type UserCreateFormData,
  type UserEditFormData,
  type UserFormSubmitData,
} from '../lib/validations';
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
import { getRoleLabel } from '@/lib/role-utils';
import { ArrowLeft, Pencil, Plus, Save } from 'lucide-react';

// 割当可能な role 群。未選択（空 value）= 権限待ち（null）は placeholder で表現し、
// 管理者が role を選んで承認 = 付与する。
const roleOptions = Object.values(UserRole).map((role) => ({
  value: role,
  label: getRoleLabel(role),
}));

const statusOptions = [
  { value: ActiveStatus.ACTIVE, label: '有効' },
  { value: ActiveStatus.INACTIVE, label: '無効' },
];

export type UserFormMode = 'create' | 'edit' | 'view';

interface UserFormProps {
  // role は null（権限待ち）も受け取り、内部で PENDING_ROLE_VALUE に正規化する。
  defaultValues?: Partial<Omit<UserCreateFormData | UserEditFormData, 'role'>> & {
    role?: UserRole | null;
    isActive?: boolean;
  };
  onSubmit?: (data: UserFormSubmitData) => Promise<void>;
  mode: UserFormMode;
  id?: string;
  loading?: boolean;
  formId?: string;
  hideActions?: boolean;
}

export function UserForm({
  defaultValues,
  onSubmit,
  mode,
  id,
  loading,
  formId,
  hideActions,
}: UserFormProps) {
  const router = useRouter();
  const isView = mode === 'view';
  const isCreate = mode === 'create';

  const initialStatus =
    defaultValues?.status ??
    (defaultValues?.isActive === false ? ActiveStatus.INACTIVE : ActiveStatus.ACTIVE);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserCreateFormData | UserEditFormData>({
    resolver: zodResolver(isCreate ? userCreateSchema : userEditSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      email: defaultValues?.email ?? '',
      // null（権限待ち）/ 未指定は sentinel（空文字）へ正規化。
      role: defaultValues?.role ?? PENDING_ROLE_VALUE,
      status: initialStatus,
    } as UserCreateFormData | UserEditFormData,
  });

  const roleValue = watch('role');
  const statusValue = watch('status');

  const handleFormSubmit = async (data: UserCreateFormData | UserEditFormData) => {
    if (!onSubmit) return;
    const { status, role, ...rest } = data;
    // sentinel（空文字）は null（権限待ち）として backend に渡す。
    const normalizedRole = role === PENDING_ROLE_VALUE ? null : role;
    await onSubmit({
      ...rest,
      role: normalizedRole,
      status,
      isActive: status === ActiveStatus.ACTIVE,
    });
  };

  return (
    <form
      id={formId}
      onSubmit={onSubmit ? handleSubmit(handleFormSubmit) : (e) => e.preventDefault()}
      onKeyDown={(e) =>
        e.key === 'Enter' && e.target instanceof HTMLInputElement && e.preventDefault()
      }
      className="w-full space-y-6 md:max-w-lg"
    >
      <FormField label="名前" required={!isView} error={errors.name?.message} htmlFor="name">
        <Input id="name" disabled={isView} {...register('name')} />
      </FormField>

      <FormField
        label="メールアドレス"
        required={!isView}
        error={errors.email?.message}
        htmlFor="email"
      >
        <Input id="email" type="email" disabled={isView} {...register('email')} />
      </FormField>

      <FormField label="ロール" error={errors.role?.message}>
        <Select
          value={roleValue}
          onValueChange={(val) => setValue('role', val as UserRole)}
          disabled={isView}
        >
          <SelectTrigger className="w-full">
            {/* 未選択 = 権限待ち（null）。空 value のため placeholder で表現する。 */}
            <SelectValue placeholder={`（${getRoleLabel(null)}）`} />
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
          onValueChange={(val) => setValue('status', val as ActiveStatus)}
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
                onClick={() => router.push(`/dashboard/users/${id}`)}
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
                onClick={() => router.push('/dashboard/users')}
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
