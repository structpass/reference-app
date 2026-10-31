import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddMemberDto {
  @ApiProperty({ description: 'ユーザーID (UUID)' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}
