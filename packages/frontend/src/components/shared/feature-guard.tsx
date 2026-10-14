'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { isValidObjectTypeKey, type FeatureId } from '@struct-pass/shared';
import { fetchObjectTypesStrict } from '@/features/custom-ledger/lib/api';
import { usePermissions } from '@/hooks/use-permissions';
import { useObjectTypePermission } from '@/hooks/use-object-type-permission';

type GuardAction = 'view' | 'create' | 'update' | 'delete';

interface FeatureGuardProps {
  featureId: FeatureId;
  action: GuardAction;
  /** 権限不足時の redirect 先。未指定時は `/dashboard/{featureId}` */
  fallbackPath?: string;
  children: ReactNode;
}

/**
 * 機能別ページに権限ガードを設置する component。
 *
 * `useFeatureGuard` hook 版が `useEffect` で redirect していたため、permission 確定後の
 * 最初の paint で children が描画されてしまう (React の render → paint → effect 順序) 問題を
 * 解消する。本 component は render 中に permission を判定し、不可なら children を mount せず
 * `null` を返す。判定確定後に useEffect で redirect。
 *
 * 設計方針:
 * - loaded=false: 何も描画しない (`null`)。permission fetch 確定まで children 不在
 * - loaded=true && (error || !permitted): `null` + useEffect で `router.replace(fallbackPath)`
 * - loaded=true && permitted: children を描画
 *
 * children が mount されないので、内部の useState / useEffect / API fetch も走らない。
 * 編集 form のちら見えだけでなく、permitted=false ユーザーの不要 API call も止まる
 * (backend `@Roles` ガード未同期 feature への二重防御)。
 *
 * @example
 * ```tsx
 * export default function NewProductPage() {
 *   return (
 *     <FeatureGuard featureId="products" action="create">
 *       <NewProductPageBody />
 *     </FeatureGuard>
 *   );
 * }
 * ```
 */
export function FeatureGuard({ featureId, action, fallbackPath, children }: FeatureGuardProps) {
  const router = useRouter();
  const { canView, canCreate, canUpdate, canDelete, loaded, error } = usePermissions();

  // useMemo で安定化させる。`fallbackPath` を動的 prop として受け取った将来形態でも、
  // 変化しない限り effect の deps が変わらず `router.replace` 多重発火を防ぐ。
  const resolvedFallback = useMemo(
    () => fallbackPath ?? `/dashboard/${featureId}`,
    [fallbackPath, featureId],
  );

  const checkFn =
    action === 'view'
      ? canView
      : action === 'create'
        ? canCreate
        : action === 'update'
          ? canUpdate
          : canDelete;
  const permitted = checkFn(featureId);
  const shouldRedirect = loaded && (error || !permitted);
  const ready = loaded && !error && permitted;

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(resolvedFallback);
    }
  }, [shouldRedirect, router, resolvedFallback]);

  if (!ready) return null;
  return <>{children}</>;
}

type ObjectTypeGuardAction = 'view' | 'create' | 'update' | 'delete';

interface ObjectTypeFeatureGuardProps {
  keyParam: string;
  action: ObjectTypeGuardAction;
  fallbackPath?: string;
  children: ReactNode;
}

type ResolvedObjectType = { key: string; isPreset: boolean };

/**
 * ObjectTypeのcatalog解決とpermission判定を、ページ本体のmountより前に行うguard。
 * 非presetは動的ID、presetは従来の静的object-types権限を使う。
 */
export function ObjectTypeFeatureGuard({
  keyParam,
  action,
  fallbackPath = '/dashboard',
  children,
}: ObjectTypeFeatureGuardProps) {
  const router = useRouter();
  const { loaded, error } = usePermissions();
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'denied' | 'error'>(
    'loading',
  );
  const [resolvedType, setResolvedType] = useState<ResolvedObjectType | null>(null);
  const currentType = resolvedType?.key === keyParam ? resolvedType : null;
  const objectTypePermission = useObjectTypePermission(keyParam, currentType?.isPreset ?? false);

  const permitted =
    action === 'view'
      ? objectTypePermission.canView()
      : action === 'create'
        ? objectTypePermission.canCreate()
        : action === 'update'
          ? objectTypePermission.canUpdate()
          : objectTypePermission.canDelete();
  const resolved = catalogState === 'ready' && currentType !== null;
  const shouldRedirect =
    loaded &&
    (error || catalogState === 'denied' || catalogState === 'error' || (resolved && !permitted));
  const ready = loaded && !error && resolved && permitted;

  useEffect(() => {
    let active = true;
    setCatalogState('loading');
    setResolvedType(null);
    if (!isValidObjectTypeKey(keyParam)) {
      setCatalogState('denied');
      return () => {
        active = false;
      };
    }

    void fetchObjectTypesStrict()
      .then((types) => {
        if (!active) return;
        const match = types.find(
          (type) =>
            type &&
            type.key === keyParam &&
            isValidObjectTypeKey(type.key) &&
            typeof type.isPreset === 'boolean',
        );
        if (!match) {
          setCatalogState('denied');
          return;
        }
        setResolvedType({ key: match.key, isPreset: match.isPreset });
        setCatalogState('ready');
      })
      .catch(() => {
        if (!active) return;
        setCatalogState('error');
      });

    return () => {
      active = false;
    };
  }, [keyParam]);

  useEffect(() => {
    if (shouldRedirect) router.replace(fallbackPath);
  }, [fallbackPath, router, shouldRedirect]);

  if (!ready) return null;
  return <>{children}</>;
}
