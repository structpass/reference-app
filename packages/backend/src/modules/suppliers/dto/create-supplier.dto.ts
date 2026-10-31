import { IsString, IsNotEmpty, IsOptional, IsEmail, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus } from '@prisma/client';
import { OptionalNotNull } from '../../../common/decorators';

export class CreateSupplierDto {
  @ApiProperty({ description: '仕入先コード', example: 'SUP-001', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: '仕入先名', example: '株式会社山田商事', maxLength: 200 })
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

  @ApiPropertyOptional({ description: '担当者名', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  contactPerson?: string;

  @ApiPropertyOptional({ description: 'メールアドレス' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'ステータス',
    enum: ActiveStatus,
    default: ActiveStatus.ACTIVE,
  })
  @OptionalNotNull()
  @IsEnum(ActiveStatus)
  status?: ActiveStatus;
}
