'use client';

import { useEffect, useState } from 'react';
import type { FieldValues, Path, PathValue, UseFormSetValue } from 'react-hook-form';
import {
  useProductLineSelection,
  type ExistingProductLine,
} from '@/hooks/use-product-line-selection';

interface UseDocumentLinesOptions<
  TForm extends FieldValues,
  TLine extends { lineNo: number; productId: string },
> {
  /** react-hook-form の setValue（明細の変更をフォーム値へ同期する） */
  setValue: UseFormSetValue<TForm>;
  /** 同期先のフィールド名（'lines' または 'items'） */
  field: Path<TForm>;
  /** 初期明細（既存伝票の明細 / defaultLines / 空行 1 行） */
  initialLines: TLine[];
  /** 既存伝票の明細（商品名の初期表示に使う） */
  existingLines?: readonly ExistingProductLine[];
}

/**
 * 伝票フォームの明細状態と商品検索の配線を 1 か所にまとめる。
 * 明細の state・商品検索・フォーム値への同期は入荷・出荷・棚卸で同じ形にする。
 */
export function useDocumentLines<
  TForm extends FieldValues,
  TLine extends { lineNo: number; productId: string },
>({ setValue, field, initialLines, existingLines }: UseDocumentLinesOptions<TForm, TLine>) {
  const [lines, setLines] = useState<TLine[]>(initialLines);
  const productSelection = useProductLineSelection(setLines, existingLines);

  useEffect(() => {
    setValue(field, lines as PathValue<TForm, Path<TForm>>);
  }, [field, lines, setValue]);

  return { lines, setLines, ...productSelection };
}
