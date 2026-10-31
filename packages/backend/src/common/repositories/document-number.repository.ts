import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toJstIso } from '../services/jst-date.service';

/**
 * 伝票番号の採番を DB 上で安全に行う Repository。
 *
 * 並行作成でも重複しないことを保証するため、番号種別 × 日付単位の
 * transaction advisory lock（`pg_advisory_xact_lock`）を取得してから、
 * 対象日の数値最大連番 + 1 を算定する。ロックはトランザクション終了時に
 * 自動解放されるため、呼び出し側は同一トランザクション内で採番と INSERT を
 * 行う（採番だけを別トランザクションで行うと重複防止にならない）。
 *
 * 既存の番号形式（`RCV-` / `SHP-` / `PO-` + `YYYYMMDD` + 連番）と桁数を維持する。
 * 連番は文字列の並び順ではなく数値の最大で求めるため、桁上がり
 * （例: `PO-…-999` の次が `PO-…-1000`）でも正しく続く。
 */
const DOCUMENT_NUMBER_LOCK_NAMESPACE = 1398100048; // 'STRP'

interface NumberSeries {
  /** 番号先頭の種別プレフィックス（例: 'RCV'）。 */
  type: string;
  /** 連番の桁数（0 埋め）。 */
  seqLength: number;
  /** 対象日の既存最大連番を返す（行が無ければ null）。 */
  readMax: (tx: Prisma.TransactionClient, prefix: string) => Promise<number | null>;
}

const RCV_SERIES: NumberSeries = {
  type: 'RCV',
  seqLength: 4,
  readMax: async (tx, prefix) => {
    const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(substring("receiving_no" from '([0-9]+)$')::int) AS "max"
      FROM "receivings"
      WHERE starts_with("receiving_no", ${prefix})
    `;
    return rows[0]?.max ?? null;
  },
};

const SHP_SERIES: NumberSeries = {
  type: 'SHP',
  seqLength: 4,
  readMax: async (tx, prefix) => {
    const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(substring("shipment_no" from '([0-9]+)$')::int) AS "max"
      FROM "shipments"
      WHERE starts_with("shipment_no", ${prefix})
    `;
    return rows[0]?.max ?? null;
  },
};

const PO_SERIES: NumberSeries = {
  type: 'PO',
  seqLength: 3,
  readMax: async (tx, prefix) => {
    const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(substring("order_no" from '([0-9]+)$')::int) AS "max"
      FROM "orders"
      WHERE starts_with("order_no", ${prefix})
    `;
    return rows[0]?.max ?? null;
  },
};

@Injectable()
export class DocumentNumberRepository {
  /** 入荷番号（`RCV-YYYYMMDD-NNNN`）を採番する。呼び出し側の tx 上で実行する。 */
  generateReceivingNo(tx: Prisma.TransactionClient): Promise<string> {
    return this.generate(tx, RCV_SERIES);
  }

  /** 出荷番号（`SHP-YYYYMMDD-NNNN`）を採番する。呼び出し側の tx 上で実行する。 */
  generateShipmentNo(tx: Prisma.TransactionClient): Promise<string> {
    return this.generate(tx, SHP_SERIES);
  }

  /** 発注番号（`PO-YYYYMMDD-NNN`）を採番する。呼び出し側の tx 上で実行する。 */
  generateOrderNo(tx: Prisma.TransactionClient): Promise<string> {
    return this.generate(tx, PO_SERIES);
  }

  private async generate(tx: Prisma.TransactionClient, series: NumberSeries): Promise<string> {
    // d644: 実行環境の時計（本番は UTC・開発機は日本時間）で暦日が変わらないよう、日本時間の暦日で揃える。
    const prefix = `${series.type}-${createJstDatePrefix(new Date())}-`;

    // 種別 × 日付単位のロック。tx 終了まで保持され、同一 prefix の採番を直列化する。
    // pg_advisory_xact_lock は void を返し Prisma が復元できないため text へキャストする。
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        ${DOCUMENT_NUMBER_LOCK_NAMESPACE}::int,
        hashtext(${prefix})
      )::text AS lock
    `;

    const max = await series.readMax(tx, prefix);
    const seq = (max ?? 0) + 1;

    return `${prefix}${String(seq).padStart(series.seqLength, '0')}`;
  }
}

/** 採番の日付部分（`YYYYMMDD`）。d644: 日本時間の暦日で揃える（実行環境の時計に従わない）。 */
export function createJstDatePrefix(date: Date): string {
  return toJstIso(date)!.slice(0, 10).replaceAll('-', '');
}
