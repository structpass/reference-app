/**
 * 入出荷明細の「有効数量」を決める規則（確定と取消で同じ数量を使うための正本）。
 *
 * 実績数（actualQty）は業務上あとから入力される任意項目で、DB 上も nullable、
 * create/update DTO でも省略可能。したがって「実績数が無いまま確定された伝票」は
 * 実際に到達する。確定時の計上数量と取消時の逆計上数量が食い違うと、取消後も
 * 在庫が元の数へ戻らない（実測: 予定5・実績 null の入荷を確定→取消で
 * 期待 -5 に対し 0 しか動かなかった）。
 *
 * 規則は1つだけ:
 *   - 実績数が null / undefined の時だけ予定数（plannedQty）へ落とす
 *   - 明示された 0 は 0 のまま保持する（`??` は nullish のみを拾うため、
 *     `||` や truthy 判定で 0 を予定数へ読み替えない）
 *
 * この関数を確定と取消の双方から使い、同じ伝票では必ず同じ数量・逆符号になるようにする。
 */
export interface QuantifiedLine {
  actualQty: number | null;
  plannedQty: number;
}

export function effectiveQty(line: QuantifiedLine): number {
  return line.actualQty ?? line.plannedQty;
}
