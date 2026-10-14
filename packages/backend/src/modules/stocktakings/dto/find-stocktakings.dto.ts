import { IsOptional, IsEnum, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { StocktakingStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto';

export class FindStocktakingsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'ステータスフィルター', enum: StocktakingStatus })
  @IsEnum(StocktakingStatus)
  @IsOptional()
  status?: StocktakingStatus;

  @ApiPropertyOptional({ description: '倉庫IDフィルター' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  warehouseId?: number;
}
