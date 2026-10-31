import { IsOptional, IsString, MaxLength, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto';

export class FindForecastDto extends PaginationDto {
  @ApiPropertyOptional({ description: '倉庫IDフィルター' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  warehouseId?: number;

  @ApiPropertyOptional({ description: '検索キーワード（商品名・コード）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;
}
