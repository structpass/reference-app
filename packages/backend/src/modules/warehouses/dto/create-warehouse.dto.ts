import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActiveStatus } from '@prisma/client';
import { OptionalNotNull } from '../../../common/decorators';

export class CreateWarehouseDto {
  @ApiProperty({ description: '倉庫コード', example: 'WH-001', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: '倉庫名', example: '東京第一倉庫', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '住所', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: '電話番号', maxLength: 20 })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '管理者名', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  manager?: string;

  @ApiPropertyOptional({ description: '収容能力', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  capacity?: number;

  @ApiPropertyOptional({
    description: 'ステータス',
    enum: ActiveStatus,
    default: ActiveStatus.ACTIVE,
  })
  @OptionalNotNull()
  @IsEnum(ActiveStatus)
  status?: ActiveStatus;
}
