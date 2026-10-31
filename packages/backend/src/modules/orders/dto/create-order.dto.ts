import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @ApiProperty({ description: '行番号', minimum: 1 })
  @IsInt()
  @Min(1)
  lineNo: number;

  @ApiProperty({ description: '商品ID (UUID)' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: '発注数量', minimum: 1 })
  @IsInt()
  @Min(1)
  orderQty: number;

  @ApiProperty({ description: '単価', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unitPrice: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: '発注日', example: '2026-03-16' })
  @IsString()
  @IsNotEmpty()
  orderDate: string;

  @ApiProperty({ description: '仕入先ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  supplierId: number;

  @ApiPropertyOptional({ description: '希望納品日', example: '2026-03-23' })
  @IsString()
  @IsOptional()
  desiredDeliveryDate?: string;

  @ApiProperty({ description: '発注明細', type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
