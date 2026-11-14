/**
 * 一覧の書き出しに載せる「状態」の日本語表記（d1019）。
 *
 * 書き出し 9 本が同じ `statusMap` を持ち、しかも同じ値を別の日本語にして並べていた
 * （出荷は画面が「出荷済」・書き出しが「出荷完了」、発注は画面が「発注済」・書き出しが「発注確定」）。
 * 画面の表記の正本は `packages/frontend/src/lib/constants.ts` の `STATUS_LABELS`。
 * 書き出しはこの 1 か所を通し、画面と書き出しで同じ状態が同じ言葉になるようにする。
 *
 * 画面にあって書き出しに無い状態（DISCONTINUED・PARTIALLY_RECEIVED・予測の印）は、書き出しの列に
 * 現れ得ないか、現れたら値のまま出して気づける形にする（黙って別の言葉へ置き換えない）。
 */
export const STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: '有効',
  INACTIVE: '無効',
  DISCONTINUED: '廃止',
  DRAFT: '下書き',
  CONFIRMED: '確定',
  COMPLETED: '完了',
  SHIPPED: '出荷済',
  ORDERED: '発注済',
  PARTIALLY_RECEIVED: '一部入荷',
};

/** 状態の値を日本語にする。知らない値はそのまま返す（消さない・別の言葉にしない）。 */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
