'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TableProperties } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/shared/page-shell';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { DataTableCard } from '@/components/shared/data-table-card';
import { type ColumnDef } from '@/components/shared/data-table';
import { FilterBar, type FilterField } from '@/components/shared/filter-bar';
import { useListPage } from '@/hooks/use-list-page';
import { usePermissions } from '@/hooks/use-permissions';
import { fetchObjectTypesStrict, type ObjectTypeResponse } from '@/features/custom-ledger/lib/api';

const filterFields: FilterField[] = [
  {
    key: 'search',
    label: '台帳',
    type: 'search',
    placeholder: '台帳名・キーで検索...',
    widthClass: 'w-52',
  },
];

/** 一覧の取得に渡す引数（一覧フックと同じ形） */
interface ObjectTypesQuery {
  page?: number;
  limit?: number;
  [key: string]: string | number | undefined;
}

/**
 * 絞り込み（台帳名・キー）。台帳一覧の API は絞り込みを受けないので、取った全件から絞る。
 * 一致の判定は他の一覧と同じく部分一致（大文字・小文字は区別しない）。
 */
function matchesSearch(objectType: ObjectTypeResponse, search: string | undefined): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return (
    objectType.name.toLowerCase().includes(needle) || objectType.key.toLowerCase().includes(needle)
  );
}

/**
 * 台帳の一覧。一覧 API（GET /object-types）は項目数（fieldCount）だけを添えて返すので、
 * 台帳ごとの詳細は取りに行かない（台帳の件数ぶん要求が増え、1 本の失敗が一覧全体の失敗に
 * なっていた・d899）。項目数が添えられていない応答では「—」を出す（詳細で補わない）。
 * 取り込みの失敗は呼び出し側で握らず投げ、「一覧の取得に失敗しました」と 0 件の案内を
 * 取り違えないようにする。
 */
async function fetchObjectTypesWithFieldCounts(query: ObjectTypesQuery) {
  const types = await fetchObjectTypesStrict();
  const search = typeof query.search === 'string' ? query.search : undefined;
  const matched = types.filter((type) => matchesSearch(type, search));
  const page = query.page ?? 1;
  // 件数セレクタは持たない（画面が 0 件案内と取得失敗を言い分けるだけで足りる）ので、
  // 指定が無ければ全件を 1 頁に入れる。
  const limit = query.limit ?? (matched.length || 1);
  const start = (page - 1) * limit;
  return {
    data: matched.slice(start, start + limit),
    meta: {
      total: matched.length,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(matched.length / limit) : 0,
    },
  };
}

export default function ObjectTypesPage() {
  return (
    <FeatureGuard featureId="object-types" action="view" fallbackPath="/dashboard">
      <ObjectTypesPageBody />
    </FeatureGuard>
  );
}

function ObjectTypesPageBody() {
  const router = useRouter();
  const { canCreate, canUpdate } = usePermissions();
  const {
    items: objectTypes,
    meta,
    loading,
    initialized,
    loadError,
    pagination,
    pageSizeOptions,
    hasActiveFilters,
    handleFilterChange,
    retryLoad,
  } = useListPage<ObjectTypeResponse>({
    tableId: 'object-types',
    basePath: '/object-types',
    entityName: '台帳',
    fetch: fetchObjectTypesWithFieldCounts,
  });

  // 並びは台帳の並び順（sortOrder）、同じなら名前順。取得した並びに依らず画面で揃える。
  const sortedObjectTypes = useMemo(
    () =>
      [...objectTypes].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja'),
      ),
    [objectTypes],
  );

  const columns: ColumnDef<ObjectTypeResponse>[] = useMemo(
    () => [
      {
        key: 'name',
        label: '台帳名',
        minWidth: 120,
        defaultWidth: 260,
        render: (objectType) => (
          <span className="font-medium text-[var(--sp-text-warm)]">
            {objectType.icon && (
              <span className="mr-2 text-[var(--sp-accent-ink)]">{objectType.icon}</span>
            )}
            {objectType.name}
          </span>
        ),
      },
      {
        key: 'key',
        label: 'キー',
        minWidth: 100,
        defaultWidth: 200,
        render: (objectType) => (
          <span className="font-mono text-xs text-[var(--sp-text-warm-mute)]">
            {objectType.key}
          </span>
        ),
      },
      {
        key: 'fieldCount',
        label: '項目数',
        minWidth: 60,
        defaultWidth: 80,
        render: (objectType) => (
          <span className="text-[var(--sp-text-warm-mute)]">{objectType.fieldCount ?? '—'}</span>
        ),
      },
      {
        key: 'isPreset',
        label: '種別',
        minWidth: 100,
        defaultWidth: 140,
        render: (objectType) =>
          objectType.isPreset ? (
            <span className="rounded-full bg-[var(--sp-paper-2)] px-2 py-1 text-xs text-[var(--sp-text-warm-mute)]">
              プリセット
            </span>
          ) : (
            <span className="rounded-full bg-[var(--sp-accent-soft)] px-2 py-1 text-xs text-[var(--sp-accent-ink)]">
              ユーザー定義
            </span>
          ),
      },
    ],
    [],
  );

  // 台帳の構造は作り直す前提の操作なので、行を押しても開かず、編集は操作列のボタンに限る。
  const openEdit = useCallback(
    (objectType: ObjectTypeResponse) => {
      router.push(`/dashboard/object-types/${objectType.key}/edit`);
    },
    [router],
  );

  return (
    <PageShell
      title="台帳管理"
      actions={
        canCreate('object-types') ? (
          <Button
            type="button"
            variant="sp-action"
            size="sp-compact"
            onClick={() => router.push('/dashboard/object-types/new')}
          >
            台帳を作成
          </Button>
        ) : undefined
      }
    >
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <div className="mb-2 flex items-center gap-2 border-b border-[var(--sp-line-warm)] bg-[var(--sp-paper-2)] px-4 py-3">
        <TableProperties className="h-4 w-4 text-[var(--sp-accent-ink)]" />
        <p className="text-sm text-[var(--sp-text-warm-mute)]">
          プリセットとユーザー定義台帳の構造を管理します。
        </p>
      </div>

      <DataTableCard<ObjectTypeResponse>
        data={sortedObjectTypes}
        columns={columns}
        initialized={initialized}
        loading={loading}
        loadError={loadError}
        onRetry={retryLoad}
        meta={meta}
        onPageChange={pagination.setPage}
        pageSizeOptions={pageSizeOptions}
        onLimitChange={pagination.setLimit}
        tableId="object-types"
        getRowKey={(objectType) => objectType.key}
        emptySubject="台帳"
        filtered={hasActiveFilters}
        ariaLabel="台帳一覧"
        actions={
          canUpdate('object-types')
            ? (objectType) =>
                objectType.isPreset ? (
                  <span
                    className="text-xs text-[var(--sp-text-warm-mute)]"
                    title="プリセット台帳は構造を変更できません"
                  >
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">プリセット台帳は構造を変更できません</span>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="sp-action"
                    size="sp-compact"
                    onClick={() => openEdit(objectType)}
                  >
                    編集
                  </Button>
                )
            : undefined
        }
      />
    </PageShell>
  );
}
