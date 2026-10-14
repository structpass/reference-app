import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/** 自由定義データ一覧のクエリ（ref-0076）。並びは id asc 固定（ページ跨ぎで安定させる）ため
 * sort / order は受け付けない。meta は既存一覧 API と同じ形（total / page / limit / totalPages）。 */
export class FindCustomRecordsDto {
  @ApiPropertyOptional({ description: 'ページ番号', default: 1, minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: '1ページあたりの件数',
    default: 200,
    minimum: 1,
    maximum: 1000,
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 200;
}
