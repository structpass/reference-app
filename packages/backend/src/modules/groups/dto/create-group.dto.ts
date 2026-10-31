import { IsString, IsNotEmpty, IsOptional, MaxLength, IsEnum, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus, UserRole } from '@prisma/client';

/**
 * グループ作成の入力。
 *
 * DB の非 null 列（code / name / role / status）は `@ValidateIf` で「未指定（undefined）」だけを
 * 許し、`null` は入れられない値として 400 で弾く。以前は `status` に `@IsOptional()` が付いており、
 * `null` も「未指定」として検証を素通りして Prisma まで届き、`Argument ... must not be null` の
 * 500 INTERNAL_ERROR になっていた（v2-445 の実測。更新 DTO の v2-428 と同じ根因）。
 * `description` だけは列が nullable（`String?`）なので `null` を受け付ける。
 */
export class CreateGroupDto {
  @ApiProperty({ description: 'グループコード', example: 'GRP-001', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'グループ名', example: '東京倉庫チーム', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '説明', maxLength: 1000 })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ description: 'ロール', enum: UserRole })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;

  @ApiPropertyOptional({
    description: 'ステータス（未指定は ACTIVE）',
    enum: ActiveStatus,
    default: ActiveStatus.ACTIVE,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ActiveStatus)
  status?: ActiveStatus;
}
