/**
 * 設定値の型の一覧（サーバーの入力検証が読む正本）。
 * 増減した時は、検証（NUMBER/BOOLEAN/JSON の判定）・シード・画面の入力部品も合わせる。
 */
export const SYSTEM_SETTING_VALUE_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON'] as const;

/** 既知の設定値の型。DB の value_type は文字列列なので、読む側でこれに絞ってから判定する。 */
export type SystemSettingValueType = (typeof SYSTEM_SETTING_VALUE_TYPES)[number];

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  valueType: string;
  label: string;
  description?: string | null;
  category: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  updatedById?: string | null;
  updatedBy?: { id: string; name: string } | null;
}

export interface PublicConfig {
  [key: string]: string;
}
