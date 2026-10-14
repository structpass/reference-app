import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ObjectTypeFeatureGuard } from '@/components/shared/feature-guard';
import { PermissionsProvider } from '@/contexts/permissions-provider';
import apiClient from '@/lib/api-client';
import { fetchObjectTypesStrict } from '@/features/custom-ledger/lib/api';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/api-client', () => ({
  default: { get: vi.fn() },
}));

vi.mock('@/features/custom-ledger/lib/api', () => ({
  fetchObjectTypesStrict: vi.fn(),
}));

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'tester', role: 'SYS_ADMIN' },
    loading: false,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
  AuthContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

const catalog = [
  {
    id: 10,
    key: 'supplier-score',
    name: '仕入先評価',
    icon: 'clipboard-check',
    sortOrder: 6,
    isPreset: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 1,
    key: 'product',
    name: '商品',
    icon: 'package',
    sortOrder: 1,
    isPreset: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

function permission(featureId: string, overrides: Partial<Record<string, boolean>> = {}) {
  return {
    featureId,
    canView: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    ...overrides,
  };
}

function renderGuard(keyParam: string, action: 'view' | 'create' | 'update' | 'delete') {
  return render(
    <PermissionsProvider>
      <ObjectTypeFeatureGuard keyParam={keyParam} action={action} fallbackPath="/dashboard">
        <div data-testid="guarded-child">protected content</div>
      </ObjectTypeFeatureGuard>
    </PermissionsProvider>,
  );
}

describe('<ObjectTypeFeatureGuard>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchObjectTypesStrict).mockResolvedValue(catalog);
  });

  it('非presetの動的権限で許可された場合だけ children を mount する', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { permissions: [permission('object-type:supplier-score')] } },
    });

    renderGuard('supplier-score', 'view');

    await waitFor(() => expect(screen.getByTestId('guarded-child')).toBeInTheDocument());
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('非presetは閲覧権限なしで書込権限だけあっても拒否する', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            permission('object-type:supplier-score', { canView: false, canCreate: true }),
          ],
        },
      },
    });

    renderGuard('supplier-score', 'create');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByTestId('guarded-child')).not.toBeInTheDocument();
  });

  it('catalogに存在しないキーは本体を mount せず拒否する', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { permissions: [permission('object-type:missing')] } },
    });

    renderGuard('missing', 'view');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByTestId('guarded-child')).not.toBeInTheDocument();
  });

  it('presetは静的 object-types 権限で判定する', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { permissions: [permission('object-types')] } },
    });

    renderGuard('product', 'view');

    await waitFor(() => expect(screen.getByTestId('guarded-child')).toBeInTheDocument());
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
