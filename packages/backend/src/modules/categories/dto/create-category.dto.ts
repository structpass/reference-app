import { IsString, IsNotEmpty, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus } from '@prisma/client';
import { OptionalNotNull } from '../../../common/decorators';

export class CreateCategoryDto {
  @ApiProperty({ description: 'カテゴリーコード', example: 'CAT-001', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'カテゴリー名', example: '電子機器', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    description: 'ステータス',
    enum: ActiveStatus,
    default: ActiveStatus.ACTIVE,
  })
  @OptionalNotNull()
  @IsEnum(ActiveStatus)
  status?: ActiveStatus;
}
