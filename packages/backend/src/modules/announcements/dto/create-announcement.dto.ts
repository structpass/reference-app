import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
  IsInt,
  MaxLength,
  IsDateString,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OptionalNotNull } from '../../../common/decorators';

/**
 * 掲示の作成入力。
 *
 * DB の非 null 列のうち任意項目（`isNew` / `isImportant`）は `undefined`（未指定）だけを許し、
 * `null` は入れられない値として 400 で弾く。`notifiedAt` はサービス側の三項演算子で
 * 既定値へ落ちるため `null` でも 500 にならず、従来どおり `@IsOptional()` のままにする。
 * 更新 DTO（`PartialType`）は親の宣言を継承するため、ここを直すと更新側の規則も揃う。
 */
export class CreateAnnouncementDto {
  @ApiProperty({ description: 'タイトル', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: '本文 (Markdown)', maxLength: 50000 })
  @IsString()
  @MaxLength(50000)
  bodyMarkdown: string;

  @ApiPropertyOptional({ description: 'New ラベル（未指定は false）', default: false })
  @OptionalNotNull()
  @IsBoolean()
  isNew?: boolean;

  @ApiPropertyOptional({ description: '重要 ラベル（未指定は false）', default: false })
  @OptionalNotNull()
  @IsBoolean()
  isImportant?: boolean;

  @ApiPropertyOptional({ description: '通知日時 (ISO 8601。未指定は現在時刻)' })
  @IsDateString()
  @IsOptional()
  notifiedAt?: string;

  @ApiProperty({ description: '表示対象グループ ID 配列', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(100)
  roleGroupIds: number[];
}
