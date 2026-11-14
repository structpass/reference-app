'use client';

import type { Warehouse } from '@struct-pass/shared';
import type { SelectOption } from '@/hooks/use-select-options';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** 倉庫マスタを選択肢へ変換する（伝票フォームで同じ値・同じ並びを使う）。 */
export const mapWarehouse = (w: Warehouse) => ({ value: String(w.id), label: w.name });

interface WarehouseFieldProps {
  isView: boolean;
  value: number;
  options: SelectOption[];
  error?: string;
  onChange: (warehouseId: number) => void;
}

/**
 * 入荷・出荷・棚卸の伝票フォームが共有する倉庫欄。
 * 参照時は名称を読み取り専用で出し、編集時は倉庫マスタから選ばせる。
 */
export function WarehouseField({ isView, value, options, error, onChange }: WarehouseFieldProps) {
  return (
    <FormField label="倉庫" required={!isView} error={error}>
      {isView ? (
        <Input
          readOnly
          disabled
          value={options.find((o) => o.value === String(value))?.label ?? '-'}
        />
      ) : (
        <Select value={value ? String(value) : ''} onValueChange={(val) => onChange(Number(val))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="倉庫を選択" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
