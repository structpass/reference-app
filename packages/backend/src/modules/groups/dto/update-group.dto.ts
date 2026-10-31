import { IsString, IsNotEmpty, IsOptional, MaxLength, IsEnum, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus, UserRole } from '@prisma/client';

/**
 * グループ更新の入力。
 *
 * `PartialType(CreateGroupDto)` を使わない理由: PartialType は全項目へ `@IsOptional()` を付けるため、
 * `null` が「未指定」と同じ扱いになって検証を素通りし、DB の非 null 列（code / name / role / status）へ
 * 届いて Prisma が `Argument ... must not be null` で落ちていた（500 INTERNAL_ERROR。v2-428 の実測）。
 *
 * 更新で許すのは「未指定（undefined）」だけで、`null` は入れられない値として 400 で弾く。
 * `@ValidateIf` は undefined の時だけ検証を飛ばすので、null は各 validator に落ちて
 * `VALIDATION_ERROR` になる（CreateGroupDto と同じ規則を、未指定だけ許す形で持つ）。
 * `description` だけは列が nullable（`String?`）なので `null` を受け付ける（説明のクリア）。
 */
export class UpdateGroupDto {
  @ApiPropertyOptional({ description: 'グループコード', example: 'GRP-001', maxLength: 50 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'グループ名', example: '東京倉庫チーム', maxLength: 200 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: '説明', maxLength: 1000, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ description: 'ロール', enum: UserRole })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(UserRole)
  @IsNotEmpty()
  role?: UserRole;

  @ApiPropertyOptional({ description: 'ステータス', enum: ActiveStatus })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ActiveStatus)
  status?: ActiveStatus;
}
