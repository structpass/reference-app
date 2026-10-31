import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { server } from '../../mocks/server';
import { apiPath } from '../_helpers/api-base';
import { permissionsRolesGetHandler } from '../../mocks/handlers/permissions-matrix.handlers';
import PermissionsPage from '@/app/dashboard/permissions/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// 権限管理画面は SYS_ADMIN 専権 (Phase 3A 縮退)。
// page 側を `<FeatureGuard featureId="permissions" action="view">` で wrap した後は、
// SYS_ADMIN 判定は `render-page.tsx` の `TestProviders`（AuthContext.Provider 経由で
// SYS_ADMIN 固定注入）+ MSW `allPermissionsHandler` の組合せで成立する。
// useAuth の個別 mock は不要。

describe('PermissionsPage / PermissionMatrix (integration)', () => {
  it('行列 API の応答が読み込まれ画面が描画される', async () => {
    render(<PermissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('機能別権限設定')).toBeInTheDocument();
      // ヘッダーのロール列が描画される
      expect(screen.getByText('倉庫(一般)')).toBeInTheDocument();
      expect(screen.getByText('システム管理')).toBeInTheDocument();
      // strict catalogから非preset台帳が権限行として追加される
      expect(screen.getByText('仕入先評価')).toBeInTheDocument();
    });
  });

  it('per-spec override で空の matrix も処理できる (初期 default のみ)', async () => {
    server.use(permissionsRolesGetHandler([]));
    render(<PermissionsPage />);

    await waitFor(() => {
      // 全セルが default 値で初期化されること
      expect(screen.getByText('機能別権限設定')).toBeInTheDocument();
      expect(screen.getByText('倉庫(管理)')).toBeInTheDocument();
    });
  });

  it('行列 API が 500 を返したときは toast.error が呼ばれる', async () => {
    server.use(
      http.get(apiPath('/permissions/roles'), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );
    render(<PermissionsPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('権限情報の取得に失敗しました');
    });
  });
});
