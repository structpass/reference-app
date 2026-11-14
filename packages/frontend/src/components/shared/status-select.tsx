'use client';

import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StatusSelectProps {
  value?: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * マスタ編集フォーム共通のステータス選択。
 * 選択肢は画面ごとに props で渡す（並べ方・操作感はこの部品で揃える）。
 */
export function StatusSelect({
  value,
  options,
  onChange,
  error,
  disabled = false,
}: StatusSelectProps) {
  return (
    <FormField label="ステータス" error={error}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="ステータスを選択" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
