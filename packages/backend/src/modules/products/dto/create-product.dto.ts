import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  MaxLength,
  Min,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { OptionalNotNull } from '../../../common/decorators';

export class CreateProductDto {
  @ApiProperty({ description: '商品コード', example: 'PRD-100', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: '商品名', example: '新商品', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '商品説明', maxLength: 1000 })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'カテゴリーID', example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  categoryId: number;

  @ApiProperty({ description: '価格', example: 10000, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({ description: '在庫数', example: 50, minimum: 0 })
  @OptionalNotNull()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stockQuantity?: number;

  @ApiPropertyOptional({
    description: '仕入価格（null は未設定。未指定と同じ扱い）',
    example: 8000,
    minimum: 0,
    nullable: true,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  purchasePrice?: number | null;

  @ApiPropertyOptional({ description: '単位', example: '個', maxLength: 20 })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({
    description: 'ステータス（未指定は ACTIVE）',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  @OptionalNotNull()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
