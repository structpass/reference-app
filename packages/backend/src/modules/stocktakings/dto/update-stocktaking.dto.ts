import {
  IsString,
  IsInt,
  IsArray,
  ValidateNested,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OptionalNotNull } from '../../../common/decorators';
import { CreateStocktakingItemDto } from './create-stocktaking.dto';

export class UpdateStocktakingDto {
  @ApiPropertyOptional({ description: '棚卸日', example: '2026-03-16' })
  @IsString()
  @IsOptional()
  stocktakingDate?: string;

  @ApiPropertyOptional({ description: '倉庫ID' })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  warehouseId?: number;

  @ApiPropertyOptional({ description: '棚卸担当者', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  stocktaker?: string;

  @ApiPropertyOptional({ description: '棚卸明細（全行置換）', type: [CreateStocktakingItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => CreateStocktakingItemDto)
  items?: CreateStocktakingItemDto[];
}
