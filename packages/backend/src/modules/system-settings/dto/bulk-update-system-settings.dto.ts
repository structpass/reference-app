import {
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BulkUpdateItemDto {
  @ApiProperty({ description: '設定キー', example: 'system.app_name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: '設定値' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  value: string;
}

export class BulkUpdateSystemSettingsDto {
  @ApiProperty({ type: [BulkUpdateItemDto], description: '更新する設定の配列（最大 50 件）' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateItemDto)
  updates: BulkUpdateItemDto[];
}
