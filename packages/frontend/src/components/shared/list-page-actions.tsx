'use client';

import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Plus } from 'lucide-react';

interface ListPageActionsProps {
  /** Excel 出力ボタンの onClick。download(...) や handleExport を渡す。 */
  onExport: () => void;
  /** Excel 出力ボタンのラベル。既定「Excel出力」。 */
  exportLabel?: string;
  /**
   * 新規登録ボタンの onClick。未指定なら新規ボタン自体を出さない
   * （forecast / shipping / stocks のような出力のみのページ）。
   */
  onNew?: () => void;
  /** 新規登録ボタンのラベル。既定「新規登録」。 */
  newLabel?: string;
  /**
   * 新規登録の権限フラグ。`onNew` 指定時のみ評価し、false なら新規ボタンを出さない
   * （`canCreate(fid)` を渡す）。既定 true。
   */
  canCreate?: boolean;
}

/**
 * 一覧ページ上部のアクション行（Excel 出力ボタン + 新規登録ボタン）。
 *
 * 14 一覧ページで逐語一致していた JSX を共通化したもの（arch-review F1）。
 * - Excel 出力は常に表示（`onExport` 必須）
 * - 新規登録は `onNew` 指定かつ `canCreate` が true のときだけ表示
 *
 * ラッパー div の `mb-1 flex ... justify-end` は各ページ共通の配置に合わせる。
 */
export function ListPageActions({
  onExport,
  exportLabel = 'Excel出力',
  onNew,
  newLabel = '新規登録',
  canCreate = true,
}: ListPageActionsProps) {
  return (
    <div className="mb-1 flex items-center justify-end gap-1">
      <Button variant="sp-action" size="sp-compact" tabIndex={-1} onClick={onExport}>
        <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
        {exportLabel}
      </Button>
      {onNew && canCreate && (
        <Button variant="sp-action" size="sp-compact" tabIndex={-1} onClick={onNew}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {newLabel}
        </Button>
      )}
    </div>
  );
}
