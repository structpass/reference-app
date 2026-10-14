'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { List, Pencil, Save } from 'lucide-react';

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
 * 伝票系 view は導線を DocumentForm 側が持つ意図的設計（アクションバー無し PageShell）のため適用しない。
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
