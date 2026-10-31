import { Injectable } from '@nestjs/common';

/**
 * 日時を「日本時間の暦日」で扱うための共通関数。
 *
 * 背景（v2-534 / d627 で実測）: この製品の日時は DB にタイムゾーンなし（UTC）で保存され、
 * アプリの時計も UTC で動いている。したがって `toISOString()` は UTC の暦日を返し、
 * 日本時間の 0:00〜9:00 に作られた記録は「1日前」の日付になる。
 * 画面（ブラウザの現地時刻）と連携ファイル（サーバー側の UTC）で日付が1日ずれる原因はここ。
 *
 * このクラスは、サーバー側で日付文字列を作る所を日本時間に揃えるための入口である。
 * d644 から、一覧の書き出し（Excel）の日時と文書番号の日付もこの入口を通す
 * （`toLocaleString()` と `getFullYear()` は実行環境の時計に従うため、本番の UTC と開発機の日本時間で
 * 同じ記録が別の日付・時刻で出てしまう）。
 * タイムゾーンを DB の型（timestamp with time zone）まで変えるのは別の決定で扱う。
 */
@Injectable()
export class JstDateService {
  /** 日本時間の暦日（`YYYY-MM-DD`）を返す。 */
  toDateString(value: Date | string): string {
    const iso = toJstIso(value);
    return iso === null ? '' : iso.slice(0, 10);
  }

  /** 日本時間の日時（`YYYY-MM-DD HH:mm`）を返す。 */
  toDateTimeMinute(value: Date | string): string {
    const iso = toJstIso(value);
    return iso === null ? '' : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  }

  /**
   * 一覧の書き出し（Excel）に載せる日時（`YYYY/M/D H:mm`。月・日・時はゼロ埋めしない）。
   * 実行環境の時計（本番は UTC・開発機は日本時間）に従わず、日本時間で出すため、
   * `toLocaleString()` は使わない（d644）。
   */
  toExportDateTime(value: Date | string): string {
    if (value === null || value === undefined) return '';
    const iso = toJstIso(value);
    if (iso === null) return '';
    const month = Number(iso.slice(5, 7));
    const day = Number(iso.slice(8, 10));
    const hour = Number(iso.slice(11, 13));
    const minute = iso.slice(14, 16);
    return `${iso.slice(0, 4)}/${month}/${day} ${hour}:${minute}`;
  }
}

/** 日本時間（UTC+9・夏時間なし）の ISO 風文字列。解釈できない値は `null`。 */
export function toJstIso(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString();
}

/** 日本標準時と UTC の差（固定 9 時間。日本は夏時間を採用していない）。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
