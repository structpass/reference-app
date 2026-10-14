import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldType } from '@prisma/client';
import { OBJECT_TYPE_KEY_PATTERN as SHARED_OBJECT_TYPE_KEY_PATTERN } from '@struct-pass/shared';

export const OBJECT_TYPE_KEY_PATTERN = SHARED_OBJECT_TYPE_KEY_PATTERN;
export const FIELD_DEF_KEY_PATTERN = /^[a-z][A-Za-z0-9]*$/;

export class CreateFieldDefDto {
  @ApiProperty({ description: 'JSONデータ内の項目キー（lower camel case）', example: 'reviewedOn' })
  @IsString()
  @Length(1, 100)
  @Matches(FIELD_DEF_KEY_PATTERN, {
    message: 'fieldDefs.key must be lower camel case and start with a lowercase letter',
  })
  key!: string;

  @ApiProperty({ description: '画面に表示する項目名', example: '評価日' })
  @IsString()
  @Length(1, 100)
  @Matches(/\S/, { message: 'fieldDefs.label must contain a non-whitespace character' })
  label!: string;

  @ApiProperty({ enum: FieldType, description: '項目のデータ型' })
  @IsEnum(FieldType)
  type!: FieldType;

  @ApiPropertyOptional({ description: '必須項目か', default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean = false;
}

export class CreateObjectTypeDto {
  @ApiProperty({ description: 'URLとAPIで使う台帳キー（kebab-case）', example: 'supplier-score' })
  @IsString()
  @Length(1, 100)
  @Matches(OBJECT_TYPE_KEY_PATTERN, {
    message: 'key must be kebab-case and start with a lowercase letter',
  })
  key!: string;

  @ApiProperty({ description: '画面に表示する台帳名', example: '仕入先評価' })
  @IsString()
  @Length(1, 100)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Lucideアイコン名（kebab-case）',
    example: 'clipboard-check',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(OBJECT_TYPE_KEY_PATTERN, { message: 'icon must be kebab-case' })
  icon?: string;

  @ApiPropertyOptional({ description: 'メニュー表示順', minimum: 0, maximum: 10000, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number = 0;

  @ApiProperty({ type: [CreateFieldDefDto], description: '台帳の項目定義（配列順で表示）' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateFieldDefDto)
  fieldDefs!: CreateFieldDefDto[];
}
