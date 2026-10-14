'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  runImport,
  type ImportResult,
  type ImportTargetKey,
  type ImportValidationError,
} from '../lib/api';

/** 取込実行後の画面表示状態。 */
export type ImportFeedback =
  | { kind: 'success'; result: ImportResult }
  | { kind: 'validation'; error: ImportValidationError };

interface UseImportResult {
  /** 取込/検証実行中フラグ。両ボタンの loading 表示に使用。 */
  running: boolean;
  /** 直近の実行結果。未実行 / 再選択時は null。 */
  feedback: ImportFeedback | null;
  /** dryRun 指定で取込を実行する。 */
  execute: (target: ImportTargetKey, file: File, dryRun: boolean) => Promise<void>;
  /** 結果表示をクリアする（ファイル再選択時等）。 */
  reset: () => void;
}

/**
 * CSV 取込の実行オーケストレーション hook。
 *
 * `runImport` が返す判別可能 union（成功 / 検証エラー）を画面表示用 `feedback` に正規化する。
 * 想定外例外（401 / 5xx / ネットワーク）は toast 通知のみ行い feedback には載せない。
 */
export function useImport(): UseImportResult {
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);

  const execute = useCallback(async (target: ImportTargetKey, file: File, dryRun: boolean) => {
    setRunning(true);
    try {
      const outcome = await runImport(target, file, dryRun);
      if (outcome.ok) {
        setFeedback({ kind: 'success', result: outcome.result });
      } else {
        setFeedback({ kind: 'validation', error: outcome.validation });
      }
    } catch {
      // 想定外例外（DB 障害 / ネットワーク等）。検証エラーは runImport が union で返すため
      // ここには来ない。
      setFeedback(null);
      toast.error('取込処理に失敗しました');
    } finally {
      setRunning(false);
    }
  }, []);

  const reset = useCallback(() => setFeedback(null), []);

  return { running, feedback, execute, reset };
}
