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

export class CreateShipmentLineDto {
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

export class CreateShipmentDto {
  @ApiProperty({ description: '出荷日', example: '2026-03-16' })
  @IsString()
  @IsNotEmpty()
  shipmentDate: string;

  @ApiProperty({ description: '倉庫ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  warehouseId: number;

  @ApiProperty({ description: '出荷先', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination: string;

  @ApiPropertyOptional({ description: '運送会社ID' })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  carrierId?: number;

  @ApiProperty({ description: '出荷明細行', type: [CreateShipmentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentLineDto)
  lines: CreateShipmentLineDto[];
}
