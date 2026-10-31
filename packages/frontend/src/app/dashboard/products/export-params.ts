/**
 * 商品一覧の書き出しに渡す条件（d788）。
 *
 * 画面で絞り込んだ条件と、今の並び順をそのまま書き出しへ渡す。
 * 渡さないと、画面で絞った 20 件を見ながら書き出すと全件（別の並び）が出て、
 * 画面と手元の表が食い違う。空の条件は渡さない。
 */
export function buildProductExportParams(
  filters: Record<string, string | undefined>,
  sort: { sort: string; order: 'asc' | 'desc' },
): Record<string, string> {
  const params: Record<string, string> = { sort: sort.sort, order: sort.order };
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value;
  }
  return params;
}
