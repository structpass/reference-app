// 台帳の項目定義が取る値型の SSOT。DB の enum（prisma FieldType）と同じ値を持ち、
// backend の応答 DTO・入力検証と frontend の項目編集の双方がここから型と表示名を取る。
// 値を増やす時は prisma/schema.prisma の enum FieldType と migration を先に合わせる。
export const FIELD_TYPES = [
  { value: 'TEXT', label: '文字列' },
  { value: 'NUMBER', label: '数値' },
  { value: 'DATE', label: '日付' },
  { value: 'SELECT', label: '選択' },
  { value: 'BOOLEAN', label: '真偽値' },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]['value'];
