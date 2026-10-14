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
import { CreateShipmentLineDto } from './create-shipment.dto';

export class UpdateShipmentDto {
  @ApiPropertyOptional({ description: '出荷日', example: '2026-03-16' })
  @IsString()
  @IsOptional()
  shipmentDate?: string;

  @ApiPropertyOptional({ description: '倉庫ID' })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  warehouseId?: number;

  @ApiPropertyOptional({ description: '出荷先', maxLength: 200 })
  @OptionalNotNull()
  @IsString()
  @MaxLength(200)
  destination?: string;

  @ApiPropertyOptional({
    description: '運送会社ID（null は不可。省略は変更しない）',
    nullable: false,
  })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  carrierId?: number;

  @ApiPropertyOptional({ description: '出荷明細行（全行置換）', type: [CreateShipmentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => CreateShipmentLineDto)
  lines?: CreateShipmentLineDto[];
}
