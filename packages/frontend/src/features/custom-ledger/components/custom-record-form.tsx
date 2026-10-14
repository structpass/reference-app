'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { FieldDefResponse } from '../lib/api';
import {
  buildCustomRecordSchema,
  normalizeCustomRecordData,
  type CustomRecordFormValues,
} from '../lib/custom-record-schema';

interface CustomRecordFormProps {
  formId: string;
  fieldDefs: FieldDefResponse[];
  initialValues?: CustomRecordFormValues;
  submitting: boolean;
  onSubmit: (data: Record<string, unknown>) => Promise<void> | void;
}

export function CustomRecordForm({
  formId,
  fieldDefs,
  initialValues,
  submitting,
  onSubmit,
}: CustomRecordFormProps) {
  const schema = buildCustomRecordSchema(fieldDefs);
  const { register, handleSubmit, formState } = useForm<
    CustomRecordFormValues,
    undefined,
    Record<string, unknown>
  >({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    mode: 'onSubmit',
  });

  return (
    <form
      id={formId}
      onSubmit={(event) => {
        void handleSubmit((data) => onSubmit(normalizeCustomRecordData(fieldDefs, data)))(event);
      }}
      className="space-y-4"
      noValidate
    >
      <fieldset disabled={submitting} className="space-y-4">
        {fieldDefs.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--sp-line-warm)] p-6 text-center text-sm text-[var(--sp-text-warm-mute)]">
            項目定義がありません。先に台帳の項目を設定してください。
          </p>
        ) : (
          fieldDefs.map((field) => {
            const fieldError = formState.errors[field.key]?.message;
            const error = typeof fieldError === 'string' ? fieldError : undefined;
            const inputId = `${formId}-${field.key}`;

            if (field.type === 'BOOLEAN') {
              return (
                <FormField
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  htmlFor={inputId}
                  error={error}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--sp-accent-ink)]"
                    aria-invalid={!!error}
                    {...register(field.key)}
                  />
                </FormField>
              );
            }

            const inputType =
              field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text';
            return (
              <FormField
                key={field.key}
                label={field.label}
                required={field.required}
                htmlFor={inputId}
                error={error}
              >
                <Input
                  id={inputId}
                  type={inputType}
                  step={field.type === 'NUMBER' ? 'any' : undefined}
                  aria-invalid={!!error}
                  {...register(field.key)}
                />
              </FormField>
            );
          })
        )}
      </fieldset>
    </form>
  );
}
