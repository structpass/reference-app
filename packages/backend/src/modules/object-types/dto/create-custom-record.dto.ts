import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 自由定義データ（CustomRecord）の作成 DTO（ref-0098）。
 *
 * data の値型検証は persist 済み FieldDef を正本に Service/Repository 層で動的に行うため、
 * DTO は data の shape（非 null オブジェクト）のみ受ける。FieldDef は DB（実行時）に存在し、
 * 静的 validator から参照できないため class-validator で型検証できない（design 判断）。
 */
export class CreateCustomRecordDto {
  @ApiProperty({
    description:
      'フィールドキー→値のオブジェクト。型は FieldDef を正本に Service 側で検証される（TEXT=string / NUMBER=number / DATE=YYYY-MM-DD string / SELECT=string / BOOLEAN=boolean）',
    example: { name: '仕入先01', rating: 80, reviewedOn: '2026-08-01' },
  })
  @IsObject()
  data!: Record<string, unknown>;
}
