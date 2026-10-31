import { IsOptional, IsString, MaxLength, IsEnum, IsInt, IsIn, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { PaginationDto, RECORD_SCOPES, type RecordScope } from '../../../common/dto';

export class FindProductsDto extends PaginationDto {
  @ApiPropertyOptional({ description: '検索キーワード（商品名・コード）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'カテゴリーIDフィルター' })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional({ description: 'ステータスフィルター', enum: ProductStatus })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({
    description:
      '記録の有無で絞る（used: 案件・入荷・出荷・棚卸の明細に使われている / unused: 使われていない）',
    enum: RECORD_SCOPES,
  })
  @IsIn(RECORD_SCOPES)
  @IsOptional()
  recordScope?: RecordScope;
}
