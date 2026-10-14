/**
 * APIレスポンスからエラーメッセージを抽出するユーティリティ
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  const resp = (err as { response?: { data?: { error?: { message?: string } } } })?.response;
  return resp?.data?.error?.message || fallback;
}
