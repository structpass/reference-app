'use client';

import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { FieldDefEditor, type FieldDefDraft } from './field-def-editor';

export interface ObjectTypeFormValues {
  key: string;
  name: string;
  icon: string;
  sortOrder: number;
  fieldDefs: FieldDefDraft[];
}

interface ObjectTypeFormProps {
  formId: string;
  mode: 'create' | 'edit';
  initialValues: ObjectTypeFormValues;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: ObjectTypeFormValues) => Promise<void> | void;
}

const OBJECT_TYPE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FIELD_DEF_KEY_PATTERN = /^[a-z][A-Za-z0-9]*$/;

function validate(values: ObjectTypeFormValues, mode: ObjectTypeFormProps['mode']) {
  const errors: {
    key?: string;
    name?: string;
    icon?: string;
    sortOrder?: string;
    fields: Record<number, string>;
  } = {
    fields: {},
  };

  if (mode === 'create' && !OBJECT_TYPE_KEY_PATTERN.test(values.key)) {
    errors.key = 'キーは小文字で始まる kebab-case で入力してください。';
  }
  if (!values.name.trim()) errors.name = '台帳名を入力してください。';
  if (values.icon && !OBJECT_TYPE_KEY_PATTERN.test(values.icon)) {
    errors.icon = 'アイコン名は小文字で始まる kebab-case で入力してください。';
  }
  if (!Number.isInteger(values.sortOrder) || values.sortOrder < 0 || values.sortOrder > 10000) {
    errors.sortOrder = '表示順は0〜10000の整数で入力してください。';
  }
  if (values.fieldDefs.length === 0) {
    errors.fields[0] = '項目を1件以上追加してください。';
  }

  const seenKeys = new Set<string>();
  values.fieldDefs.forEach((field, index) => {
    if (!FIELD_DEF_KEY_PATTERN.test(field.key)) {
      errors.fields[index] = '項目キーは小文字で始まる lower camel case で入力してください。';
    } else if (seenKeys.has(field.key)) {
      errors.fields[index] = '項目キーが重複しています。';
    } else {
      seenKeys.add(field.key);
    }
    if (!field.label.trim() && !errors.fields[index]) {
      errors.fields[index] = '表示名を入力してください。';
    }
  });

  return errors;
}

export function getObjectTypeRequestError(error: unknown, fallback: string): string {
  const responseData =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { data?: unknown } }).response?.data
      : undefined;
  if (typeof responseData === 'object' && responseData !== null && 'error' in responseData) {
    const apiError = (responseData as { error?: unknown }).error;
    if (typeof apiError === 'object' && apiError !== null && 'message' in apiError) {
      const message = (apiError as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function ObjectTypeForm({
  formId,
  mode,
  initialValues,
  submitting,
  error,
  onSubmit,
}: ObjectTypeFormProps) {
  const [values, setValues] = useState(initialValues);
  const [validationErrors, setValidationErrors] = useState<ReturnType<typeof validate>>({
    fields: {},
  });

  const update = <K extends keyof ObjectTypeFormValues>(key: K, value: ObjectTypeFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(values, mode);
    setValidationErrors(nextErrors);
    if (
      nextErrors.key ||
      nextErrors.name ||
      nextErrors.icon ||
      nextErrors.sortOrder ||
      Object.keys(nextErrors.fields).length > 0
    ) {
      return;
    }
    void onSubmit({
      ...values,
      key: values.key.trim(),
      name: values.name.trim(),
      icon: values.icon.trim(),
      fieldDefs: values.fieldDefs.map((field) => ({
        ...field,
        key: field.key.trim(),
        label: field.label.trim(),
      })),
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="台帳キー"
          required={mode === 'create'}
          htmlFor={`${formId}-key`}
          error={validationErrors.key}
        >
          <Input
            id={`${formId}-key`}
            value={values.key}
            onChange={(event) => update('key', event.target.value)}
            placeholder="supplier-score"
            disabled={mode === 'edit' || submitting}
            aria-describedby={`${formId}-key-help`}
            aria-invalid={!!validationErrors.key}
          />
          <p id={`${formId}-key-help`} className="text-xs text-[var(--sp-text-warm-mute)]">
            {mode === 'edit' ? 'キーは変更できません。' : 'URLに使う不変の識別子です。'}
          </p>
        </FormField>
        <FormField label="台帳名" required htmlFor={`${formId}-name`} error={validationErrors.name}>
          <Input
            id={`${formId}-name`}
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="仕入先評価"
            disabled={submitting}
            aria-invalid={!!validationErrors.name}
          />
        </FormField>
        <FormField label="アイコン" htmlFor={`${formId}-icon`} error={validationErrors.icon}>
          <Input
            id={`${formId}-icon`}
            value={values.icon}
            onChange={(event) => update('icon', event.target.value)}
            placeholder="clipboard-list"
            disabled={submitting}
            aria-invalid={!!validationErrors.icon}
          />
          <p className="text-xs text-[var(--sp-text-warm-mute)]">Lucideアイコン名（任意）</p>
        </FormField>
        <FormField
          label="表示順"
          required
          htmlFor={`${formId}-sort-order`}
          error={validationErrors.sortOrder}
        >
          <Input
            id={`${formId}-sort-order`}
            type="number"
            min={0}
            max={10000}
            step={1}
            value={values.sortOrder}
            onChange={(event) => update('sortOrder', Number(event.target.value))}
            disabled={submitting}
            aria-invalid={!!validationErrors.sortOrder}
          />
        </FormField>
      </div>

      <FieldDefEditor
        fieldDefs={values.fieldDefs}
        errors={validationErrors.fields}
        onChange={(fieldDefs) => update('fieldDefs', fieldDefs)}
      />
    </form>
  );
}
