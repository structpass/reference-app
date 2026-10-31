'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';
import { ConfirmDialog } from './confirm-dialog';
import { ArrowLeft, Pencil, Plus, Save } from 'lucide-react';

export type DocumentFormMode = 'create' | 'edit' | 'view';

export interface StatusAction {
  label: string;
  onAction: () => Promise<boolean>;
  confirmTitle: string;
  confirmDescription: string;
}

interface DocumentFormProps {
  mode: DocumentFormMode;
  documentNo?: string;
  status?: string;
  headerFields: React.ReactNode;
  lineItemsNode: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  submitting?: boolean;
  statusActions?: StatusAction[];
  transitioning?: boolean;
  backPath: string;
  editPath?: string;
  /**
   * 登録/更新ボタンの表示ラベル。未指定時は従来の「登録する/更新する」を使用。
   * トランザクション系では「受注登録/受注更新」など業務語を渡す。
   */
  submitLabel?: { create?: string; edit?: string };
  /** form 要素に付与する id。EditPageShell の footer から `<Button form={formId}>` で submit するために使用 */
  formId?: string;
  /** form 内のアクションボタン群を非表示にする。EditPageShell footer に置き換えた場合に true */
  hideActions?: boolean;
}

export function DocumentForm({
  mode,
  documentNo,
  status,
  headerFields,
  lineItemsNode,
  onSubmit,
  submitting = false,
  statusActions = [],
  transitioning = false,
  backPath,
  editPath,
  submitLabel,
  formId,
  hideActions = false,
}: DocumentFormProps) {
  const router = useRouter();
  const isView = mode === 'view';
  const [confirmAction, setConfirmAction] = useState<StatusAction | null>(null);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const ok = await confirmAction.onAction();
    setConfirmAction(null);
    if (ok) {
      router.refresh();
      window.location.reload();
    }
  };

  const submitText = submitting
    ? '保存中...'
    : mode === 'edit'
      ? (submitLabel?.edit ?? '更新する')
      : (submitLabel?.create ?? '登録する');

  return (
    <>
      <form
        id={formId}
        onSubmit={onSubmit ?? ((e) => e.preventDefault())}
        onKeyDown={(e) =>
          e.key === 'Enter' && e.target instanceof HTMLInputElement && e.preventDefault()
        }
        className="space-y-6"
      >
        {/* Header with document number and status */}
        {(documentNo || status) && (
          <div className="flex items-center gap-4">
            {documentNo && (
              <span className="text-lg font-semibold text-[var(--sp-text-warm)]">{documentNo}</span>
            )}
            {status && <StatusBadge status={status} />}
          </div>
        )}

        {/* Header fields */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{headerFields}</div>

        {/* Line items */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--sp-text-warm)]">明細</h3>
          {lineItemsNode}
        </div>

        {/* Actions */}
        {!hideActions && (
          <div className="flex flex-wrap gap-3 border-t border-[var(--sp-line-warm)] pt-4">
            {!isView && (
              <Button type="submit" variant="sp-action" disabled={submitting}>
                {mode === 'edit' ? (
                  <Save className="mr-1 h-4 w-4" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                {submitText}
              </Button>
            )}

            {isView && editPath && status === 'DRAFT' && (
              <Button type="button" variant="sp-action" onClick={() => router.push(editPath)}>
                <Pencil className="mr-1 h-4 w-4" />
                編集
              </Button>
            )}

            {isView &&
              statusActions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="sp-action"
                  disabled={transitioning}
                  onClick={() => setConfirmAction(action)}
                >
                  {action.label}
                </Button>
              ))}

            <Button
              type="button"
              variant="sp-action"
              onClick={() => (isView ? router.back() : router.push(backPath))}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {isView ? '戻る' : '一覧へ戻る'}
            </Button>
          </div>
        )}
      </form>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction?.confirmTitle ?? ''}
        description={confirmAction?.confirmDescription ?? ''}
        confirmLabel="実行"
        onConfirm={handleConfirm}
      />
    </>
  );
}
