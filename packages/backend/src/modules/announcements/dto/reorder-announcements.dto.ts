import {
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const MAX_INT32 = 2147483647;
const MIN_INT32 = -2147483648;

class ReorderAnnouncementItemDto {
  @ApiProperty({ description: '掲示 ID' })
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ description: '新しい sortOrder' })
  @IsInt()
  @Min(MIN_INT32)
  @Max(MAX_INT32)
  sortOrder: number;
}

export class ReorderAnnouncementsDto {
  @ApiProperty({ type: [ReorderAnnouncementItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReorderAnnouncementItemDto)
  items: ReorderAnnouncementItemDto[];
}
