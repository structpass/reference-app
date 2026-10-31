import { IsOptional, IsString, MaxLength, IsEnum, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ReceivingStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto';

export class FindReceivingsDto extends PaginationDto {
  @ApiPropertyOptional({ description: '検索キーワード（入荷番号・仕入先）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'ステータスフィルター', enum: ReceivingStatus })
  @IsEnum(ReceivingStatus)
  @IsOptional()
  status?: ReceivingStatus;

  @ApiPropertyOptional({ description: '倉庫IDフィルター' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  warehouseId?: number;
}
