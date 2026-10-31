import { AxiosError } from 'axios';
import type { ImportRowError } from '@struct-pass/shared';
// 循環依存回避: barrel export (`@/features/auth` 等) を経由せず直接パス参照（CLAUDE.md 規約）。
import apiClient from '@/lib/api-client';

// backend dto と同一概念のため shared 型に一本化（naming-shape §5）。
// 旧 `ImportRowError` 名は本 feature 内の他ファイル参照を壊さないよう re-export で温存。
export type { ImportRowError };

/**
 * CSV 取込の対象（将来 warehouses / carriers 等を追加できるよう値で管理）。
 * 現状は products 1 択。
 */
export type ImportTargetKey = 'products';

/** 取込成功時の data shape（backend `ImportResultDto`、spec §6.1）。 */
export interface ImportResult {
  target: ImportTargetKey;
  dryRun: boolean;
  created: number;
  updated: number;
}

/**
 * 取込検証エラー（HTTP 400 `VALIDATION_ERROR`）を正規化した結果。
 * - `rows` あり: 行レベルエラー（テーブル表示 + エラー CSV DL 対象）
 * - `rows` 空 / undefined: ファイルレベルエラー（message のみ表示）
 */
export interface ImportValidationError {
  message: string;
  rows: ImportRowError[];
}

/** 取込呼び出しの結果。成功 or 検証エラーを判別可能 union で返す。 */
export type ImportOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; validation: ImportValidationError };

const BASE = '/imports';

/**
 * CSV ファイルを取込エンドポイントに送信する。
 * 成功 (HTTP 200) と検証エラー (HTTP 400 `VALIDATION_ERROR`) を `ImportOutcome` で判別可能に返す。
 * それ以外の例外（401 / 5xx / ネットワーク等）は呼び出し側に re-throw する。
 */
export async function runImport(
  target: ImportTargetKey,
  file: File,
  dryRun: boolean,
): Promise<ImportOutcome> {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await apiClient.post<{ success: true; data: ImportResult }>(
      `${BASE}/${target}`,
      formData,
      {
        params: { dryRun },
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return { ok: true, result: res.data.data };
  } catch (err) {
    const validation = extractValidationError(err);
    if (validation) {
      return { ok: false, validation };
    }
    throw err;
  }
}

/**
 * 取込対象のテンプレート CSV（ヘッダー行のみ）を blob 取得し、ブラウザにダウンロードさせる。
 * blob ダウンロードは `useFileDownload` hook 経由で行うため、本関数では URL のみ提供する。
 */
export function templateUrl(target: ImportTargetKey): string {
  return `${BASE}/${target}/template`;
}

/**
 * axios エラーから `VALIDATION_ERROR` 応答を取り出して正規化する。
 * 検証エラーでない場合は `null`（呼び出し側で re-throw 判定）。
 */
function extractValidationError(err: unknown): ImportValidationError | null {
  if (!(err instanceof AxiosError)) return null;
  const body = err.response?.data as
    | {
        success?: false;
        error?: {
          code?: string;
          message?: string;
          details?: { rows?: ImportRowError[] };
        };
      }
    | undefined;
  if (err.response?.status !== 400 || body?.error?.code !== 'VALIDATION_ERROR') {
    return null;
  }
  return {
    message: body.error.message ?? 'CSV取込の検証に失敗しました',
    rows: body.error.details?.rows ?? [],
  };
}
