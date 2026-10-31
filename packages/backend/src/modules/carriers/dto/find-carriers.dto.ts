import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto';

export class FindCarriersDto extends PaginationDto {
  @ApiPropertyOptional({ description: '検索キーワード（運送会社名・コード）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'ステータスフィルター', enum: ActiveStatus })
  @IsEnum(ActiveStatus)
  @IsOptional()
  status?: ActiveStatus;
}
