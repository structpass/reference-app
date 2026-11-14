'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './confirm-dialog';
import type { StatusAction } from './document-form';
import { ArrowLeft, List, Pencil, Save } from 'lucide-react';

interface BackToListButtonProps {
  listHref: string;
  tabIndex?: number;
}

/** 「一覧へ戻る」ボタン。全詳細/編集ページ共通（ref-0042 / invariants §3）。 */
export function BackToListButton({ listHref, tabIndex }: BackToListButtonProps) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="sp-action"
      size="sp-compact"
      tabIndex={tabIndex}
      onClick={() => router.push(listHref)}
    >
      <List className="mr-1 h-3.5 w-3.5" />
      一覧へ戻る
    </Button>
  );
}

interface EditPageActionsProps {
  formId: string;
  submitLabel: string;
  submitting: boolean;
  listHref: string;
  /** マスタ系は既存どおり tabIndex={-1}（フォーム入力のタブ移動からボタンを外す）。伝票系は未指定。 */
  tabIndex?: number;
}

/** 編集ページのアクションバー（更新 submit + 一覧へ戻る）。 */
export function EditPageActions({
  formId,
  submitLabel,
  submitting,
  listHref,
  tabIndex,
}: EditPageActionsProps) {
  return (
    <>
      <Button
        type="submit"
        form={formId}
        variant="sp-action"
        size="sp-compact"
        tabIndex={tabIndex}
        loading={submitting}
      >
        <Save className="mr-1 h-3.5 w-3.5" />
        {submitLabel}
      </Button>
      <BackToListButton listHref={listHref} tabIndex={tabIndex} />
    </>
  );
}

interface DetailPageActionsProps {
  editHref: string;
  listHref: string;
  tabIndex?: number;
}

/**
 * マスタ系 view ページのアクションバー（編集 + 一覧へ戻る）。
 * 伝票系 view は状態遷移（確定・完了）も並べるため DocumentViewActions を使う。
 */
export function DetailPageActions({ editHref, listHref, tabIndex }: DetailPageActionsProps) {
  const router = useRouter();
  return (
    <>
      <Button
        type="button"
        variant="sp-action"
        size="sp-compact"
        tabIndex={tabIndex}
        onClick={() => router.push(editHref)}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" />
        編集
      </Button>
      <BackToListButton listHref={listHref} tabIndex={tabIndex} />
    </>
  );
}

interface DocumentViewActionsProps {
  /** DRAFT のときだけ出す編集導線。省略すると編集ボタンを出さない。 */
  editHref?: string;
  /** 伝票の状態遷移（確定・完了など）。押すと確認ダイアログを挟む。 */
  statusActions?: StatusAction[];
  /** 状態遷移の実行中。二重送信を防ぐためボタンを不活性にする。 */
  transitioning?: boolean;
}

/**
 * 伝票系 view ページのアクションバー（編集 + 状態遷移 + 戻る）。
 * 画面右上のアクション行（EditPageShell の actions）に置き、表の内側へ導線を置かない。
 * 遷移に成功したら表示中の伝票を取り直す（DocumentForm の同処理をここへ移した）。
 * tabIndex は指定しない（伝票の編集ページと同じ扱い＝キーボードの Tab で到達できる。
 * マスタ系 view が -1 なのは、あちらがフォーム入力の巡回からボタンを外す既存方針のため）。
 */
export function DocumentViewActions({
  editHref,
  statusActions = [],
  transitioning = false,
}: DocumentViewActionsProps) {
  const router = useRouter();
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

  return (
    <>
      {editHref && (
        <Button
          type="button"
          variant="sp-action"
          size="sp-compact"
          onClick={() => router.push(editHref)}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" />
          編集
        </Button>
      )}
      {statusActions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant="sp-action"
          size="sp-compact"
          disabled={transitioning}
          onClick={() => setConfirmAction(action)}
        >
          {action.label}
        </Button>
      ))}
      <Button type="button" variant="sp-action" size="sp-compact" onClick={() => router.back()}>
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        戻る
      </Button>

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
