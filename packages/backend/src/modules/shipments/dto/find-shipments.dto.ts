import { IsOptional, IsString, MaxLength, IsEnum, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ShipmentStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto';

export class FindShipmentsDto extends PaginationDto {
  @ApiPropertyOptional({ description: '検索キーワード（出荷番号・出荷先）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'ステータスフィルター', enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  @IsOptional()
  status?: ShipmentStatus;

  @ApiPropertyOptional({ description: '倉庫IDフィルター' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  warehouseId?: number;
}
