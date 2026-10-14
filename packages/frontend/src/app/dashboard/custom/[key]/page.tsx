'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageShell } from '@/components/shared/page-shell';
import { ObjectTypeFeatureGuard } from '@/components/shared/feature-guard';
import { DataTableCard } from '@/components/shared/data-table-card';
import { DeleteActionButton } from '@/components/shared/delete-action-button';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import { type ColumnDef } from '@/components/shared/data-table';
import type { PaginationMeta } from '@struct-pass/shared';
import {
  deleteCustomRecord,
  fetchObjectTypeByKey,
  fetchCustomRecords,
  type FieldDefResponse,
  type CustomRecordResponse,
} from '@/features/custom-ledger/lib/api';
import { formatFieldValue } from '@/features/custom-ledger/lib/format';
import { LoadFailed } from '@/features/custom-ledger/components/load-failed';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { useObjectTypePermission } from '@/hooks/use-object-type-permission';
import { extractErrorMessage } from '@/lib/error-utils';

// Next.js 15.5 は page の params を Promise で渡す（sync 型のままだと next build の型検査が
// 落ちて本番ビルド不能・ref-0083 の検証で発覚）。client component なので React.use で解決する。
export default function CustomLedgerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return (
    <ObjectTypeFeatureGuard keyParam={key} action="view" fallbackPath="/dashboard">
      <CustomLedgerPageBody keyParam={key} />
    </ObjectTypeFeatureGuard>
  );
}

function CustomLedgerPageBody({ keyParam }: { keyParam: string }) {
  const router = useRouter();
  const [isPreset, setIsPreset] = useState(false);
  const { canCreate, canUpdate, canDelete } = useObjectTypePermission(keyParam, isPreset);
  const [fieldDefs, setFieldDefs] = useState<FieldDefResponse[] | null>(null);
  const [ledgerName, setLedgerName] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [records, setRecords] = useState<CustomRecordResponse[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  const listHref = `/dashboard/custom/${encodeURIComponent(keyParam)}`;
  const openNew = useCallback(() => {
    router.push(`${listHref}/new`);
  }, [listHref, router]);
  const openEdit = useCallback(
    (record: CustomRecordResponse) => {
      router.push(`${listHref}/${record.id}/edit`);
    },
    [listHref, router],
  );

  const remove = useCallback(
    async (id: number | string) => {
      try {
        await deleteCustomRecord(keyParam, id);
        toast.success('レコードを削除しました');
        return true;
      } catch (error) {
        toast.error(extractErrorMessage(error, 'レコードの削除に失敗しました。'));
        return false;
      }
    },
    [keyParam],
  );
  // 再試行は押した瞬間に処理中へ倒す（ボタンを無効化して連打＝一覧 API の重複取得を止める）。
  const reloadRecords = useCallback(() => {
    setLoading(true);
    setReloadVersion((version) => version + 1);
  }, []);
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<CustomRecordResponse>({
    remove,
    onSuccess: reloadRecords,
  });

  // 台帳定義（項目定義込み）を取得。404 は notFound 表示へ倒す（toast は出さない・criteria 5）。
  useEffect(() => {
    let active = true;
    // ref-0078 review: key 切替時（/custom/a/… → /custom/b/…）に旧 state を完全に倒す。
    // page を 1 へ戻さないと、前の台帳の 2 ページ目以降が新しい台帳へ持ち越され「3 / 1 page」等になる。
    // fieldDefs も null へ戻す（旧 key の列定義で新 key のデータを一時表示しない）。
    setPage(1);
    setFieldDefs(null);
    setRecords(null);
    setMeta(null);
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    setLedgerName('');
    setIsPreset(false);
    void fetchObjectTypeByKey(keyParam).then((type) => {
      if (!active) return;
      if (!type) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setLedgerName(type.name);
      setIsPreset(type.isPreset);
      setFieldDefs(type.fieldDefs ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [keyParam]);

  // 自由定義データの一覧。取得失敗は空データへ倒さず、失敗表示と再試行へ分岐する
  // （実データがあるのに「データがありません」と断定しない）。正常な 0 件は従来どおり空表示のまま。
  // プリセットは records API が空を返す（ref-0076 設計）のでそのまま出る。
  // key 切替時は effect 1 が setPage(1)+setFieldDefs(null) を同コミットで行うため、ここは
  // fieldDefs 非 null でのみ走る（旧 key の列定義で新 key のデータを引かない・ref-0078 review）。
  // 極小の窓で旧 page のまま fieldDefs が解決した場合も、再レンダー後の page=1 再取得で自己修正される。
  useEffect(() => {
    if (notFound || fieldDefs === null) return;
    let active = true;
    setLoading(true);
    void fetchCustomRecords(keyParam, page, 50).then((res) => {
      if (!active) return;
      if (res.status === 'ok') {
        setRecords(res.data);
        setMeta(res.meta);
        setLoadError(false);
      } else {
        setRecords(null);
        setMeta(null);
        setLoadError(true);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [keyParam, page, fieldDefs, notFound, reloadVersion]);

  const columns = useMemo<ColumnDef<CustomRecordResponse>[]>(
    () =>
      (fieldDefs ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        minWidth: 80,
        defaultWidth: 160,
        render: (item: CustomRecordResponse) => formatFieldValue(item.data?.[f.key], f.type),
      })),
    [fieldDefs],
  );

  if (notFound) {
    return (
      <PageShell title="台帳">
        <p className="p-6 text-[var(--sp-text-warm-2)]">指定された台帳は見つかりませんでした。</p>
      </PageShell>
    );
  }

  return (
    <PageShell title={ledgerName || '台帳'}>
      {fieldDefs !== null && !isPreset && canCreate() ? (
        <div className="mb-1 flex justify-end">
          <Button
            type="button"
            variant="sp-action"
            size="sp-compact"
            onClick={openNew}
            aria-label="レコードを新規登録"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新規登録
          </Button>
        </div>
      ) : null}
      {isPreset ? (
        <p className="p-6 text-[var(--sp-text-warm-2)]">この台帳は専用画面からご利用ください。</p>
      ) : loadError ? (
        <LoadFailed message="一覧の取得に失敗しました。" onRetry={reloadRecords} busy={loading} />
      ) : (
        <DataTableCard<CustomRecordResponse>
          data={records ?? []}
          columns={columns}
          initialized={fieldDefs !== null && records !== null}
          loading={loading}
          meta={meta}
          onPageChange={setPage}
          getRowKey={(item) => String(item.id)}
          emptyMessage="データがありません"
          ariaLabel={`${ledgerName}一覧`}
          onRowClick={canUpdate() ? openEdit : undefined}
          actions={
            canUpdate() || canDelete()
              ? (item) => (
                  <div className="flex justify-center gap-1">
                    {canUpdate() ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`レコード #${item.id}を編集`}
                        title="編集"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(item);
                        }}
                        className="text-[var(--sp-text-warm-mute)] hover:bg-accent hover:text-[var(--sp-accent-ink)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {canDelete() ? (
                      <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
                    ) : null}
                  </div>
                )
              : undefined
          }
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="レコードを削除"
        targetLabel={`レコード #${deleteTarget?.id ?? ''}`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
