import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSystemSettingDto {
  @ApiProperty({ description: '設定値' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  value: string;
}
