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

export class CreateReceivingLineDto {
  @ApiProperty({ description: '行番号', minimum: 1 })
  @IsInt()
  @Min(1)
  lineNo: number;

  @ApiProperty({ description: '商品ID (UUID)' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: '予定数量', minimum: 1 })
  @IsInt()
  @Min(1)
  plannedQty: number;

  @ApiPropertyOptional({ description: '実績数量', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  actualQty?: number;
}

export class CreateReceivingDto {
  @ApiProperty({ description: '入荷日', example: '2026-03-16' })
  @IsString()
  @IsNotEmpty()
  receivingDate: string;

  @ApiProperty({ description: '倉庫ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  warehouseId: number;

  @ApiProperty({ description: '仕入先ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  supplierId: number;

  @ApiProperty({ description: '入荷明細行', type: [CreateReceivingLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReceivingLineDto)
  lines: CreateReceivingLineDto[];
}
