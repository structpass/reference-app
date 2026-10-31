'use client';

import { use, useCallback, useMemo } from 'react';
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
import { useListPage } from '@/hooks/use-list-page';
import {
  deleteCustomRecord,
  fetchCustomRecordsForList,
  type CustomLedgerListResult,
  type CustomRecordResponse,
  type FieldDefResponse,
} from '@/features/custom-ledger/lib/api';
import { formatFieldValue } from '@/features/custom-ledger/lib/format';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { useObjectTypePermission } from '@/hooks/use-object-type-permission';
import { extractErrorMessage } from '@/lib/error-utils';

// Next.js 15.5 は page の params を Promise で渡す（sync 型のままだと next build の型検査が
// 落ちてビルド不能・ref-0083 の検証で発覚）。client component なので React.use で解決する。
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

  // 取得と状態（読み込み・失敗・再試行・ページ送り・遅れて届いた応答の破棄）は一覧フックに
  // 任せ、この画面固有の組み立て（項目定義から列を作る・台帳名を出す）だけをここに残す（d931）。
  // 台帳定義は明細と同じ取得で届く（fetchCustomRecordsForList）。key を切り替えると取得ごと
  // 作り直され、前の台帳の項目定義・台帳名・ページ位置が新しい台帳へ持ち越されない
  // （ref-0078 review）。
  const fetchRecords = useMemo(() => fetchCustomRecordsForList(keyParam), [keyParam]);
  const {
    items: records,
    meta,
    loading,
    initialized,
    loadError,
    pagination,
    res,
    retryLoad,
    reload,
  } = useListPage<CustomRecordResponse>({
    tableId: 'object-types',
    basePath: `/object-types/${encodeURIComponent(keyParam)}/records`,
    entityName: 'レコード',
    fetch: fetchRecords,
  });
  const ledger = (res as CustomLedgerListResult['res'] | null)?.ledger ?? null;
  const notFound = initialized && !loadError && ledger === null;
  const fieldDefs = ledger?.fieldDefs ?? null;
  const isPreset = ledger?.isPreset ?? false;
  const { canCreate, canUpdate, canDelete } = useObjectTypePermission(keyParam, isPreset);

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
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<CustomRecordResponse>({
    remove,
    onSuccess: reload,
  });

  const columns = useMemo<ColumnDef<CustomRecordResponse>[]>(
    () =>
      (fieldDefs ?? []).map((f: FieldDefResponse) => ({
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
    <PageShell title={ledger?.name || '台帳'}>
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
      ) : (
        // 取得失敗は空一覧へ倒さず、失敗の表示と再試行へ分岐する（実データがあるのに
        // 「データが見つかりませんでした」と断定しない）。正常な 0 件は空表示のまま。
        // プリセットは records API が空を返す（ref-0076 設計）のでそのまま出る。
        // 件数セレクタは出さない（ref-0078 criteria 3・表の下は全件数とページ送りだけ）。
        <DataTableCard<CustomRecordResponse>
          data={records}
          columns={columns}
          initialized={initialized}
          loading={loading}
          loadError={loadError}
          onRetry={retryLoad}
          meta={meta}
          onPageChange={pagination.setPage}
          getRowKey={(item) => String(item.id)}
          ariaLabel={`${ledger?.name ?? ''}一覧`}
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
