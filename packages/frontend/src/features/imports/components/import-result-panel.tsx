'use client';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFileDownload } from '@/hooks/use-file-download';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { buildErrorCsv } from '../lib/error-csv';
import type { ImportFeedback } from '../hooks/use-import';

interface ImportResultPanelProps {
  feedback: ImportFeedback;
}

/**
 * 取込/検証実行結果の表示エリア（spec §8.2-5）。
 *
 * - 成功: 「新規 N 件 / 更新 N 件」。dryRun 時は「見込み」と明示。
 * - 検証エラー（行レベル）: 行番号・列・理由のテーブル + エラー CSV ダウンロード。
 *   all-or-nothing のため「0 件取込」を明示。
 * - 検証エラー（ファイルレベル）: `rows` が空のため message のみ表示。
 */
export function ImportResultPanel({ feedback }: ImportResultPanelProps) {
  const { downloadText } = useFileDownload();
  // 明細 hover 帯（ref-0038・rete mdl-0050 追随）: 基底 TableRow から静的 hover を撤去した
  // ため、消費側で帯を導入する。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('tbody tr');

  if (feedback.kind === 'success') {
    const { dryRun, created, updated } = feedback.result;
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-emerald-800">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-5 w-5" />
          {dryRun ? '検証が完了しました（取込は実行されていません）' : '取込が完了しました'}
        </div>
        <p className="mt-2 text-sm">
          {dryRun ? '見込み: ' : ''}
          新規 {created} 件 / 更新 {updated} 件
        </p>
      </div>
    );
  }

  const { error } = feedback;
  const isFileLevel = error.rows.length === 0;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="h-5 w-5" />
        検証に失敗しました（0 件取込）
      </div>
      <p className="mt-2 text-sm text-foreground/80">{error.message}</p>

      {!isFileLevel && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-[var(--sp-text-warm-mute)]">
              エラー {error.rows.length} 件
            </span>
            <Button
              variant="sp-action"
              size="sm"
              onClick={() => downloadText(buildErrorCsv(error.rows), 'import-errors.csv')}
            >
              <Download className="mr-1 h-4 w-4" />
              エラー CSV ダウンロード
            </Button>
          </div>
          <div
            ref={listRef}
            className="relative mt-2 max-h-80 overflow-auto rounded-md border"
            onMouseOver={onMouseOver}
            onMouseLeave={onMouseLeave}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">行番号</TableHead>
                  <TableHead className="w-40">列</TableHead>
                  <TableHead>理由</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {error.rows.map((r, i) => (
                  <TableRow key={`${r.row}-${r.column}-${i}`} className="sp-row-pillable">
                    <TableCell>{r.row}</TableCell>
                    <TableCell>{r.column ?? ''}</TableCell>
                    <TableCell>{r.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {bandStyle ? (
              <div aria-hidden="true" className="sp-row-hoverband" style={bandStyle} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
