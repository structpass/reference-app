import { IsString, IsInt, IsArray, ValidateNested, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OptionalNotNull } from '../../../common/decorators';
import { CreateOrderItemDto } from './create-order.dto';

export class UpdateOrderDto {
  @ApiPropertyOptional({ description: '発注日', example: '2026-03-16' })
  @IsString()
  @IsOptional()
  orderDate?: string;

  @ApiPropertyOptional({ description: '仕入先ID' })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  supplierId?: number;

  @ApiPropertyOptional({ description: '希望納品日', example: '2026-03-23' })
  @IsString()
  @IsOptional()
  desiredDeliveryDate?: string;

  @ApiPropertyOptional({ description: '発注明細（全行置換）', type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];
}
