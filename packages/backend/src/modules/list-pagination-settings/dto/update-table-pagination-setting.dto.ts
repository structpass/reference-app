import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OptionalNotNull } from '../../../common/decorators';

/**
 * pageSizeOptions の形式: "10,20,50,100" のような数値カンマ区切り。
 * 1〜10 件、各値 1〜10000、空白なし。
 */
export const PAGE_SIZE_OPTIONS_REGEX = /^[1-9]\d{0,4}(,[1-9]\d{0,4}){0,9}$/;

export class UpdateTablePaginationSettingDto {
  @ApiProperty({ description: 'デフォルト表示件数', example: 50, required: false })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(10000)
  defaultPageSize?: number;

  @ApiProperty({
    description: '表示件数選択肢（カンマ区切り）',
    example: '10,20,50,100',
    required: false,
  })
  @OptionalNotNull()
  @IsString()
  @MaxLength(100)
  @Matches(PAGE_SIZE_OPTIONS_REGEX, {
    message: 'pageSizeOptions must be comma-separated positive integers (e.g. "10,20,50,100")',
  })
  pageSizeOptions?: string;
}
