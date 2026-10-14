import { IsString, IsOptional, IsEmail, IsEnum, MaxLength, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { OptionalNotNull } from '../../../common/decorators';

// 承認アクション（role 付与 + isActive 有効化）と表示名/メール修正に使う。
export class UpdateUserDto {
  @ApiPropertyOptional({ description: '表示名', maxLength: 100 })
  @OptionalNotNull()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'メールアドレス' })
  @OptionalNotNull()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'ロール', enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ description: '有効フラグ' })
  @OptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  // ref-0066: SSO 連携の許可（使い切りフラグ）。未連携ユーザーへ true を設定すると、
  // 次回 SSO ログインのメール一致リンクが成立し、その場で false へ消費される。
  @ApiPropertyOptional({
    description: 'SSO 連携の許可（未連携ユーザーの使い切りフラグ・管理者操作）',
  })
  @OptionalNotNull()
  @IsBoolean()
  allowOidcLink?: boolean;
}
