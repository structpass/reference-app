import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsArray,
  ValidateNested,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateStocktakingItemDto {
  @ApiProperty({ description: '商品ID (UUID)' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: '理論在庫数' })
  @IsInt()
  @Min(0)
  theoreticalQty: number;

  @ApiPropertyOptional({ description: '実数量' })
  @IsInt()
  @Min(0)
  @IsOptional()
  actualQty?: number;

  @ApiPropertyOptional({ description: '差異理由', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  differenceReason?: string;
}

export class CreateStocktakingDto {
  @ApiProperty({ description: '棚卸日', example: '2026-03-16' })
  @IsString()
  @IsNotEmpty()
  stocktakingDate: string;

  @ApiProperty({ description: '倉庫ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  warehouseId: number;

  @ApiPropertyOptional({ description: '棚卸担当者', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  stocktaker?: string;

  @ApiProperty({ description: '棚卸明細', type: [CreateStocktakingItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStocktakingItemDto)
  items: CreateStocktakingItemDto[];
}
