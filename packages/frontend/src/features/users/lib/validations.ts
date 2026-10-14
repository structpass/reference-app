import { z } from 'zod';
import { ActiveStatus, UserRole } from '@struct-pass/shared';

// role 未割当（pending / 承認待ち）を表す UI 上の sentinel 値。
// Select の value に null を直接持たせられないため空文字を使い、
// submit 時に null へ正規化する。
export const PENDING_ROLE_VALUE = '';

const roleSchema = z.nativeEnum(UserRole).or(z.literal(PENDING_ROLE_VALUE));

export const userCreateSchema = z.object({
  name: z.string().min(1, '名前は必須です'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  // 未選択（権限待ち）を許容。承認 = 管理者が role を選んで保存。
  role: roleSchema,
  status: z.nativeEnum(ActiveStatus),
});

export const userEditSchema = z.object({
  name: z.string().min(1, '名前は必須です'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  role: roleSchema,
  status: z.nativeEnum(ActiveStatus),
});

export type UserCreateFormData = z.infer<typeof userCreateSchema>;
export type UserEditFormData = z.infer<typeof userEditSchema>;

// onSubmit に渡る正規化後の形。role の sentinel（空文字）は null に置き換わり、
// status は isActive へ写像される（backend の create/update DTO に合わせる）。
export type UserFormSubmitData = Omit<UserCreateFormData | UserEditFormData, 'role'> & {
  role: UserRole | null;
  isActive: boolean;
};
