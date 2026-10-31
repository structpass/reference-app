import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateFieldDefDto, OBJECT_TYPE_KEY_PATTERN } from './create-object-type.dto';

export class UpdateObjectTypeDto {
  @ApiProperty({ description: '画面に表示する台帳名', example: '仕入先評価' })
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Lucideアイコン名。省略またはnullでアイコンを解除',
    example: 'clipboard-check',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(OBJECT_TYPE_KEY_PATTERN, { message: 'icon must be kebab-case' })
  icon?: string | null;

  @ApiPropertyOptional({ description: 'メニュー表示順。省略時は0', minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiProperty({ type: [CreateFieldDefDto], description: '台帳の項目定義（完全置換）' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateFieldDefDto)
  fieldDefs!: CreateFieldDefDto[];
}
