import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, MaxLength } from 'class-validator';
import { OptionalNotNull } from '../../../common/decorators';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus, UserRole } from '@prisma/client';

// SSO 一本化に伴い username / password は撤去（認証情報は rete が保持）。
// 管理者は表示名・メール・ロール・有効フラグのみを扱う。
export class CreateUserDto {
  @ApiProperty({ description: '表示名', example: '山田 太郎', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'メールアドレス' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'ロール（未指定 = 権限待ち）', enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ description: '状態', enum: ActiveStatus, default: ActiveStatus.ACTIVE })
  @OptionalNotNull()
  @IsEnum(ActiveStatus)
  status?: ActiveStatus;
}
