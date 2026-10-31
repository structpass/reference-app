'use client';

import { useMemo } from 'react';
import type { TableId, TablePaginationSetting } from '@struct-pass/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type PageSizeDraft,
  isDefaultPageSizeValid,
  isPageSizeOptionsValid,
} from '../lib/page-size-draft';

const TABLE_LABELS: Record<TableId, string> = {
  products: '商品',
  warehouses: '倉庫',
  carriers: '運送会社',
  suppliers: '仕入先',
  categories: 'カテゴリ',
  users: 'ユーザー',
  groups: 'グループ',
  receivings: '入荷',
  shipments: '出荷',
  shipping: '入出荷履歴',
  stocktakings: '棚卸',
  stocks: '在庫',
  forecast: '予測在庫',
  orders: '発注',
};

interface ListPreferencesFormProps {
  settings: TablePaginationSetting[];
  drafts: Record<string, PageSizeDraft>;
  dirtyKeys: string[];
  onChange: (tableId: string, field: keyof PageSizeDraft, value: string) => void;
}

/**
 * 一覧ごとのページサイズ管理フォーム（presentational）。
 * ドラフト状態・保存アクションはページ側が保持し、本コンポーネントは描画と
 * 行ごとの入力検証表示（aria-invalid）のみを担う。
 */
export function ListPreferencesForm({
  settings,
  drafts,
  dirtyKeys,
  onChange,
}: ListPreferencesFormProps) {
  const sorted = useMemo(
    () => [...settings].sort((a, b) => a.tableId.localeCompare(b.tableId, 'ja')),
    [settings],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)]">
      <div className="max-h-[70vh] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 border-b border-[var(--sp-line-warm)] bg-[var(--sp-paper-2)]">
            <tr>
              <th className="h-9 w-1/4 px-4 text-left align-middle text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]">
                一覧
              </th>
              <th className="h-9 w-1/5 px-4 text-left align-middle text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]">
                デフォルト件数
              </th>
              <th className="h-9 px-4 text-left align-middle text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]">
                表示件数選択肢（カンマ区切り）
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((setting) => {
              const draft = drafts[setting.tableId] ?? {
                defaultPageSize: setting.defaultPageSize,
                pageSizeOptions: setting.pageSizeOptions,
              };
              const isDirty = dirtyKeys.includes(setting.tableId);
              const optionsInvalid = !isPageSizeOptionsValid(draft.pageSizeOptions);
              const sizeInvalid = !isDefaultPageSizeValid(draft.defaultPageSize);
              return (
                <tr
                  key={setting.tableId}
                  className="h-11 border-t border-[var(--sp-line-warm-2)] last:border-b-0"
                >
                  <td className="px-4 align-middle">
                    <Label className="block text-sm font-medium text-[var(--sp-text-warm)]">
                      {TABLE_LABELS[setting.tableId] ?? setting.tableId}
                      {isDirty && (
                        <span className="ml-2 text-xs font-normal text-[var(--sp-accent-ink)]">
                          ●未保存
                        </span>
                      )}
                    </Label>
                  </td>
                  <td className="px-4 align-middle">
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={draft.defaultPageSize}
                      onChange={(e) => onChange(setting.tableId, 'defaultPageSize', e.target.value)}
                      className="h-8 max-w-32"
                      aria-invalid={sizeInvalid}
                      title={sizeInvalid ? '1〜10000 の整数を指定' : undefined}
                    />
                  </td>
                  <td className="px-4 align-middle">
                    <Input
                      type="text"
                      value={draft.pageSizeOptions}
                      onChange={(e) => onChange(setting.tableId, 'pageSizeOptions', e.target.value)}
                      placeholder="10,20,50,100"
                      className="h-8 max-w-md font-mono"
                      aria-invalid={optionsInvalid}
                      title={
                        optionsInvalid ? '正の整数のカンマ区切り（例: 10,20,50,100）' : undefined
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
