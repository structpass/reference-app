import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { subscribeObjectTypeCatalog } from '@/features/custom-ledger/lib/catalog-events';
import NewObjectTypePage from '@/app/dashboard/object-types/new/page';
import EditObjectTypePage from '@/app/dashboard/object-types/[key]/edit/page';

/**
 * v2-273: 台帳の作成・編集の保存経路が、左メニュー（Sidebar）の catalog と権限キャッシュを
 * 取り直す通知を出すことを固定する。Sidebar 側の再取得は sidebar.test.tsx が見る。
 */

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: [],
    loaded: true,
    error: false,
    canView: () => true,
    canCreate: () => true,
    canUpdate: () => true,
    canDelete: () => true,
  }),
}));

// 権限キャッシュの取り直しは Provider が公開している refresh を直接使う（参照用 hook の API は増やさない）。
vi.mock('@/contexts/permissions-provider', () => ({
  usePermissionsContext: () => ({
    permissions: [],
    loaded: true,
    error: false,
    refresh: refreshMock,
  }),
}));

const { createObjectTypeMock, updateObjectTypeMock, fetchObjectTypeByKeyMock } = vi.hoisted(() => ({
  createObjectTypeMock: vi.fn(),
  updateObjectTypeMock: vi.fn(),
  fetchObjectTypeByKeyMock: vi.fn(),
}));

vi.mock('@/features/custom-ledger/lib/api', () => ({
  createObjectType: createObjectTypeMock,
  updateObjectType: updateObjectTypeMock,
  fetchObjectTypeByKey: fetchObjectTypeByKeyMock,
  fetchObjectTypesStrict: vi.fn(() => Promise.resolve([])),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const objectTypeResponse = {
  id: 40,
  key: 'new-ledger',
  name: '新規台帳',
  icon: null,
  sortOrder: 3,
  isPreset: false,
  fieldDefs: [
    {
      id: 1,
      objectTypeId: 40,
      key: 'reviewedOn',
      label: '評価日',
      type: 'DATE' as const,
      required: false,
      sortOrder: 0,
    },
  ],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

/** 台帳フォームは項目定義1件以上を要求するため、作成の検証では1件足してから保存する。 */
async function fillCreateForm(user: UserEvent) {
  await user.type(screen.getByLabelText(/台帳キー/), 'new-ledger');
  await user.type(screen.getByLabelText(/台帳名/), '新規台帳');
  await user.click(screen.getByRole('button', { name: /項目を追加/ }));
  await user.type(screen.getByLabelText(/項目キー/), 'reviewedOn');
  await user.type(screen.getByLabelText(/表示名/), '評価日');
}

describe('ObjectType 保存後の左メニュー再取得通知（v2-273）', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockClear();
    createObjectTypeMock.mockReset();
    updateObjectTypeMock.mockReset();
    fetchObjectTypeByKeyMock.mockReset();
  });

  it('台帳の作成に成功すると catalog の再取得通知と権限の取り直しを行い、一覧へ戻ること', async () => {
    const user = userEvent.setup();
    const invalidated = vi.fn();
    const unsubscribe = subscribeObjectTypeCatalog(invalidated);
    createObjectTypeMock.mockResolvedValue(objectTypeResponse);
    render(<NewObjectTypePage />);

    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(createObjectTypeMock).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'new-ledger', name: '新規台帳' }),
      ),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/object-types'));
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('台帳の作成に失敗した時は通知も遷移もしないこと', async () => {
    const user = userEvent.setup();
    const invalidated = vi.fn();
    const unsubscribe = subscribeObjectTypeCatalog(invalidated);
    createObjectTypeMock.mockRejectedValue(new Error('boom'));
    render(<NewObjectTypePage />);

    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(createObjectTypeMock).toHaveBeenCalled());
    expect(invalidated).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('台帳の更新に成功すると catalog の再取得通知を行い、一覧へ戻ること', async () => {
    const user = userEvent.setup();
    const invalidated = vi.fn();
    const unsubscribe = subscribeObjectTypeCatalog(invalidated);
    fetchObjectTypeByKeyMock.mockResolvedValue(objectTypeResponse);
    updateObjectTypeMock.mockResolvedValue({ ...objectTypeResponse, name: '改名した台帳' });
    // params は use() が解決するまで suspend するため、安定した Promise を Suspense 配下で渡し、
    // 解決（＝fallback から本体への差し替え）まで act 内で待つ。
    const params = Promise.resolve({ key: 'new-ledger' });
    await act(async () => {
      render(
        <Suspense fallback={<div>loading</div>}>
          <EditObjectTypePage params={params} />
        </Suspense>,
      );
      await params;
    });

    const nameInput = await screen.findByLabelText(/台帳名/);
    await user.clear(nameInput);
    await user.type(nameInput, '改名した台帳');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(updateObjectTypeMock).toHaveBeenCalledWith(
        'new-ledger',
        expect.objectContaining({ name: '改名した台帳' }),
      ),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/object-types'));
    expect(invalidated).toHaveBeenCalledTimes(1);
    // 編集は key を変えない＝動的権限の集合も変わらないため、権限キャッシュは取り直さない。
    expect(refreshMock).not.toHaveBeenCalled();

    unsubscribe();
  });
});
