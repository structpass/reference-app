'use client';

import { useMemo } from 'react';
import type { SystemSetting } from '@struct-pass/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { THEME_KEY, THEME_META, THEME_IDS } from '@/features/theme';

interface SystemSettingsFormProps {
  settings: SystemSetting[];
  drafts: Record<string, string>;
  dirtyKeys: string[];
  onChange: (key: string, value: string) => void;
}

/**
 * フラット 2 列レイアウトのシステム設定フォーム（presentational）。
 * カテゴリ分類は廃止（項目が増えたら別途タブ化）。
 * ドラフト状態・保存アクションはページ側が保持し、本コンポーネントは描画のみを担う。
 */
export function SystemSettingsForm({
  settings,
  drafts,
  dirtyKeys,
  onChange,
}: SystemSettingsFormProps) {
  // 表示順は UIテーマを先頭固定 → sortOrder → label
  const sortedSettings = useMemo(
    () =>
      [...settings].sort((a, b) => {
        if (a.key === THEME_KEY) return -1;
        if (b.key === THEME_KEY) return 1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.label.localeCompare(b.label, 'ja');
      }),
    [settings],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)]">
      <table className="w-full">
        <thead className="sticky top-0 z-10 border-b border-[var(--sp-line-warm)] bg-[var(--sp-paper-2)]">
          <tr>
            <th className="h-9 w-1/4 px-4 text-left align-middle text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]">
              表示名
            </th>
            <th className="h-9 w-2/5 px-4 text-left align-middle text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]">
              備考
            </th>
            <th className="h-9 px-4 text-left align-middle text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]">
              値
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedSettings.map((setting) => {
            const value = drafts[setting.key] ?? setting.value;
            const isDirty = dirtyKeys.includes(setting.key);
            return (
              <tr
                key={setting.key}
                className="border-t border-[var(--sp-line-warm-2)] last:border-b-0"
              >
                <td className="px-4 py-3 align-top">
                  <Label className="block text-sm font-medium text-[var(--sp-text-warm)]">
                    {setting.label}
                    {isDirty && (
                      <span className="ml-2 text-xs font-normal text-[var(--sp-accent-ink)]">
                        ●未保存
                      </span>
                    )}
                  </Label>
                </td>
                <td className="px-4 py-3 align-top">
                  {setting.description && (
                    <p className="text-xs text-[var(--sp-text-warm-mute)]">{setting.description}</p>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <SettingValueInput
                    setting={setting}
                    value={value}
                    onChange={(v) => onChange(setting.key, v)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface SettingValueInputProps {
  setting: SystemSetting;
  value: string;
  onChange: (value: string) => void;
}

function SettingValueInput({ setting, value, onChange }: SettingValueInputProps) {
  // テーマキーは Select で表示
  if (setting.key === THEME_KEY) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="max-w-md">
          <SelectValue placeholder="テーマを選択" />
        </SelectTrigger>
        <SelectContent>
          {THEME_IDS.map((id) => (
            <SelectItem key={id} value={id}>
              {THEME_META[id].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // BOOLEAN 型は true/false の Select
  if (setting.valueType === 'BOOLEAN') {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="max-w-md">
          <SelectValue placeholder="true / false" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // NUMBER 型は number input
  if (setting.valueType === 'NUMBER') {
    return (
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-md"
      />
    );
  }

  // STRING / JSON 型は text input
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-md"
    />
  );
}
