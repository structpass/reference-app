/**
 * 一覧を「業務の記録（案件・入荷・出荷・棚卸の明細）に使われているか」で絞る時の値。
 * 未指定なら絞らない。商品一覧と書き出しの両方で同じ値を使う。
 */
export const RECORD_SCOPES = ['used', 'unused'] as const;

export type RecordScope = (typeof RECORD_SCOPES)[number];
