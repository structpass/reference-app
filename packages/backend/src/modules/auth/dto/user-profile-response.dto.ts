import { UserRole } from '@prisma/client';

/**
 * GET /auth/profile のレスポンス DTO。
 * User entity 直返しではなく安全な列のみを手組みで返す（規約 §1 DTO 境界）。
 * role は pending（承認待ち）ユーザーで null。
 */
export interface UserProfileResponseDto {
  id: string;
  email: string;
  name: string;
  role: UserRole | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
