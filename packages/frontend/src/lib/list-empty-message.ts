/** 一覧の空案内。呼び出し側は対象名と絞り込み状態だけを渡す。 */
export function getListEmptyMessage({
  filtered = false,
  subject = 'データ',
  emptyMessage,
}: {
  filtered?: boolean;
  subject?: string;
  emptyMessage?: string;
} = {}): string {
  return (
    emptyMessage ??
    (filtered ? `条件に合う${subject}がありませんでした` : `${subject}が見つかりませんでした`)
  );
}
