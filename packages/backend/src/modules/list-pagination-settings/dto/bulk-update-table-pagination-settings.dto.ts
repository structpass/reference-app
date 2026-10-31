import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TABLE_IDS } from '@struct-pass/shared';
import { PAGE_SIZE_OPTIONS_REGEX } from './update-table-pagination-setting.dto';

export class BulkUpdateTablePaginationSettingItemDto {
  @ApiProperty({ description: 'テーブル ID（TABLE_IDS のいずれか）', example: 'products' })
  @IsString()
  @IsIn(TABLE_IDS as readonly string[])
  tableId!: string;

  @ApiProperty({ description: 'デフォルト表示件数', example: 50 })
  @IsInt()
  @Min(1)
  @Max(10000)
  defaultPageSize!: number;

  @ApiProperty({ description: '表示件数選択肢（カンマ区切り）', example: '10,20,50,100' })
  @IsString()
  @MaxLength(100)
  @Matches(PAGE_SIZE_OPTIONS_REGEX, {
    message: 'pageSizeOptions must be comma-separated positive integers (e.g. "10,20,50,100")',
  })
  pageSizeOptions!: string;
}

export class BulkUpdateTablePaginationSettingsDto {
  @ApiProperty({
    type: [BulkUpdateTablePaginationSettingItemDto],
    description: '更新する設定の配列（最大 50 件）',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateTablePaginationSettingItemDto)
  updates!: BulkUpdateTablePaginationSettingItemDto[];
}
