import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP').format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/** 日本標準時と UTC の差（固定 9 時間。日本は夏時間を採用していない）。d644。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の暦日（`YYYY-MM-DD`）。実行環境の時計に従わない。d644。 */
function toJstDateString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatISODate(date: Date | string): string {
  if (typeof date === 'string') {
    // 日付だけの文字列（DB の date 型）は、日付を変えずにそのまま返す。
    const m = date.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (m) return m[1];
  }
  return toJstDateString(typeof date === 'string' ? new Date(date) : date);
}

export function todayISODate(): string {
  return toJstDateString(new Date());
}
