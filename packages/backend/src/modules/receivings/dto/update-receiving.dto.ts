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
import { CreateReceivingLineDto } from './create-receiving.dto';

export class UpdateReceivingDto {
  @ApiPropertyOptional({ description: '入荷日', example: '2026-03-16' })
  @IsString()
  @IsOptional()
  receivingDate?: string;

  @ApiPropertyOptional({ description: '倉庫ID' })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  warehouseId?: number;

  @ApiPropertyOptional({ description: '仕入先ID' })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  supplierId?: number;

  @ApiPropertyOptional({ description: '入荷明細行（全行置換）', type: [CreateReceivingLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => CreateReceivingLineDto)
  lines?: CreateReceivingLineDto[];
}
