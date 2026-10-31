import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 自由定義データ（CustomRecord）の更新 DTO（ref-0098）。
 *
 * data は完全置換（full replacement）で、値型検証は persist 済み FieldDef を正本に
 * Service/Repository 層で動的に行う（create と同方針）。DTO は data の shape のみ受ける。
 */
export class UpdateCustomRecordDto {
  @ApiProperty({
    description:
      'フィールドキー→値のオブジェクト（完全置換）。型は FieldDef を正本に Service 側で検証される',
    example: { name: '仕入先01', rating: 85, reviewedOn: '2026-08-02' },
  })
  @IsObject()
  data!: Record<string, unknown>;
}
