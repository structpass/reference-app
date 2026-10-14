import type { FieldDefResponse } from './api';

/** 型ごとの最小整形。未知型は文字列化・null は空欄（ref-0078 criteria 7）。 */
export function formatFieldValue(value: unknown, type: FieldDefResponse['type']): string {
  if (value === null || value === undefined) return '';
  switch (type) {
    case 'NUMBER':
      return String(value);
    case 'DATE':
      return typeof value === 'string' ? value.slice(0, 10) : String(value);
    case 'BOOLEAN':
      return value === true ? 'はい' : value === false ? 'いいえ' : String(value);
    default:
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : JSON.stringify(value);
  }
}
