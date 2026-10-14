'use client';

import type { ChangeEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const FIELD_TYPES = [
  { value: 'TEXT', label: '文字列' },
  { value: 'NUMBER', label: '数値' },
  { value: 'DATE', label: '日付' },
  { value: 'SELECT', label: '選択' },
  { value: 'BOOLEAN', label: '真偽値' },
] as const;

export type ObjectTypeFieldType = (typeof FIELD_TYPES)[number]['value'];

export interface FieldDefDraft {
  /** UI-only identity; kept separate from the backend FieldDef key. */
  id: string;
  key: string;
  label: string;
  type: ObjectTypeFieldType;
  required: boolean;
}

interface FieldDefEditorProps {
  fieldDefs: FieldDefDraft[];
  errors?: Record<number, string>;
  onChange: (fieldDefs: FieldDefDraft[]) => void;
}

let draftSequence = 0;
const nextDraftId = () => {
  draftSequence += 1;
  return draftSequence;
};

const newFieldDef = (): FieldDefDraft => ({
  id: `draft-${nextDraftId()}`,
  key: '',
  label: '',
  type: 'TEXT',
  required: false,
});

export function FieldDefEditor({ fieldDefs, errors, onChange }: FieldDefEditorProps) {
  const updateField = (index: number, patch: Partial<FieldDefDraft>) => {
    onChange(fieldDefs.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  const handleTextChange =
    (index: number, key: 'key' | 'label') => (event: ChangeEvent<HTMLInputElement>) => {
      updateField(index, { [key]: event.target.value });
    };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--sp-text-warm)]">項目定義</h2>
          <p className="text-xs text-[var(--sp-text-warm-mute)]">
            lower camel case のキーと表示名を設定してください。
          </p>
        </div>
        <Button
          type="button"
          variant="sp-outline"
          size="sp-compact"
          onClick={() => onChange([...fieldDefs, newFieldDef()])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          項目を追加
        </Button>
      </div>

      {fieldDefs.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--sp-line-warm)] p-6 text-center text-sm text-[var(--sp-text-warm-mute)]">
          <p>項目を1件以上追加してください。</p>
          {errors?.[0] && <p className="mt-2 text-destructive">{errors[0]}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {fieldDefs.map((field, index) => (
            <div
              // 項目キーや行位置ではなく UI 専用の identity を使う。入力変更・途中行削除後も
              // 各行の React identity を維持し、別の FieldDef の入力欄へ状態が移らないようにする。
              key={field.id}
              className="rounded-md border border-[var(--sp-line-warm-2)] bg-[var(--sp-paper-2)] p-3"
            >
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_10rem_7rem_auto] md:items-end">
                <FormField label="項目キー" required htmlFor={`field-key-${index}`}>
                  <Input
                    id={`field-key-${index}`}
                    value={field.key}
                    onChange={handleTextChange(index, 'key')}
                    placeholder="reviewedOn"
                    aria-invalid={!!errors?.[index]}
                  />
                </FormField>
                <FormField label="表示名" required htmlFor={`field-label-${index}`}>
                  <Input
                    id={`field-label-${index}`}
                    value={field.label}
                    onChange={handleTextChange(index, 'label')}
                    placeholder="評価日"
                    aria-invalid={!!errors?.[index]}
                  />
                </FormField>
                <FormField label="型" required htmlFor={`field-type-${index}`}>
                  <Select
                    value={field.type}
                    onValueChange={(type) =>
                      updateField(index, { type: type as ObjectTypeFieldType })
                    }
                  >
                    <SelectTrigger id={`field-type-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <label className="flex h-[var(--sp-input-h)] items-center gap-2 text-sm text-[var(--sp-text-warm)]">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(index, { required: event.target.checked })}
                    className="h-4 w-4 accent-[var(--sp-accent-ink)]"
                  />
                  必須
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${field.label || `項目${index + 1}`}を削除`}
                  onClick={() => onChange(fieldDefs.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              {errors?.[index] && <p className="mt-2 text-sm text-destructive">{errors[index]}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
