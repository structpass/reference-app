import { IsOptional, IsString, MaxLength, IsInt, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto';

export enum ShippingType {
  RECEIVING = 'RECEIVING',
  SHIPMENT = 'SHIPMENT',
}

export class FindShippingDto extends PaginationDto {
  @ApiPropertyOptional({ description: '検索キーワード（伝票番号・仕入先/出荷先）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: '種別フィルター', enum: ShippingType })
  @IsEnum(ShippingType)
  @IsOptional()
  type?: ShippingType;

  @ApiPropertyOptional({ description: '倉庫IDフィルター' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  warehouseId?: number;
}
