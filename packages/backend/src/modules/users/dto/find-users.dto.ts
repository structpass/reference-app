import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus, UserRole } from '@prisma/client';
import { PaginationDto } from '../../../common/dto';

export class FindUsersDto extends PaginationDto {
  @ApiPropertyOptional({ description: '検索キーワード（ユーザー名・メール・グループ名）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'ロールフィルター', enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ description: '状態フィルター', enum: ActiveStatus })
  @IsEnum(ActiveStatus)
  @IsOptional()
  status?: ActiveStatus;
}
