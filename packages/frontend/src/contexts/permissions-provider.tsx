'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/features/auth/hooks/use-auth';

export interface PermissionEntry {
  featureId: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

interface PermissionsContextValue {
  permissions: PermissionEntry[];
  loaded: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/**
 * ユーザー権限を 1 度だけ fetch し、Provider 配下の hook で共有するための Context。
 *
 * 設計方針:
 * - `AuthProvider` 配下に置き、auth 解決 (loading=false && user) を待ってから fetch
 * - mount 時に `/permissions/my-permissions` を 1 回 fetch
 * - 配下の `usePermissions` / `<FeatureGuard>` はキャッシュを参照（多重 fetch しない）
 * - 権限変更後（matrix の保存等）は `refresh()` で再 fetch
 * - fetch 失敗時は fail-closed（loaded=true / error=true）
 * - unmount 時の dangling promise 対応として mountedRef gate を持つ
 */
export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const inflightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    // 二重 fetch 抑止（matrix 保存後の refresh が連打されても 1 リクエストにまとめる）
    if (inflightRef.current) {
      return inflightRef.current;
    }
    const promise = (async () => {
      try {
        const res = await apiClient.get('/permissions/my-permissions');
        if (!mountedRef.current) return;
        setPermissions(res.data.data?.permissions ?? []);
        setError(false);
        setLoaded(true);
      } catch {
        if (!mountedRef.current) return;
        setError(true);
        setLoaded(true);
      } finally {
        inflightRef.current = null;
      }
    })();
    inflightRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    // auth が解決するまで permission fetch を遅延させる:
    // - authLoading=true: /auth/me 進行中。permission API は 401 になる可能性 → 待つ
    // - user=null && authLoading=false: 未ログイン。middleware が /login へ redirect する。
    //   ここで fetch しても無意味なので skip。
    if (authLoading) return;
    if (!user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const value = useMemo<PermissionsContextValue>(
    () => ({ permissions, loaded, error, refresh }),
    [permissions, loaded, error, refresh],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissionsContext(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error('usePermissionsContext must be used within <PermissionsProvider>');
  }
  return ctx;
}
