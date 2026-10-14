import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionMatrix } from '@/features/permissions/components/permission-matrix';
import { buildMatrix } from '@/features/permissions/lib/use-permission-matrix';
import { buildLogicalFeatures } from '@/features/permissions/lib/feature-list';

// PermissionMatrix は presentational（fetch/save は usePermissionMatrix が担う）。
// ここでは matrix prop を与えた描画と onToggle 配線のみを検証する。
describe('PermissionMatrix (presentational)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderMatrix = (onToggle = vi.fn()) => {
    render(<PermissionMatrix matrix={buildMatrix([])} onToggle={onToggle} />);
    return onToggle;
  };

  it('全ロール列ヘッダーを表示すること', () => {
    renderMatrix();
    expect(screen.getByText('倉庫(一般)')).toBeInTheDocument();
    expect(screen.getByText('倉庫(管理)')).toBeInTheDocument();
    expect(screen.getByText('事務(一般)')).toBeInTheDocument();
    expect(screen.getByText('事務(管理)')).toBeInTheDocument();
    expect(screen.getByText('システム管理')).toBeInTheDocument();
  });

  it('カテゴリ列に全カテゴリラベルを表示すること', () => {
    renderMatrix();
    expect(screen.getByText('A. マスタ管理')).toBeInTheDocument();
    expect(screen.getByText('B. 入出荷管理')).toBeInTheDocument();
    expect(screen.getByText('C. 在庫管理')).toBeInTheDocument();
    expect(screen.getByText('D. 発注管理')).toBeInTheDocument();
    expect(screen.getByText('E. システム管理')).toBeInTheDocument();
    expect(screen.getByText('F. 運用管理')).toBeInTheDocument();
  });

  it('thead に「カテゴリ」「機能名」列を表示すること', () => {
    renderMatrix();
    expect(screen.getByText('カテゴリ')).toBeInTheDocument();
    expect(screen.getByText('機能名')).toBeInTheDocument();
  });

  it('F 運用管理カテゴリに「ファイル取込」機能名を表示し、移植済の「ダッシュボード」は表示しないこと', () => {
    renderMatrix();
    expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    expect(screen.queryByText('ダッシュボード')).not.toBeInTheDocument();
  });

  it('機能名を表示すること', () => {
    renderMatrix();
    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('倉庫')).toBeInTheDocument();
    expect(screen.getByText('運送会社')).toBeInTheDocument();
  });

  it('凡例を表示すること', () => {
    renderMatrix();
    expect(screen.getByText('凡例:')).toBeInTheDocument();
    expect(screen.getByText('参照(R)')).toBeInTheDocument();
    expect(screen.getByText('登録(C)')).toBeInTheDocument();
    expect(screen.getByText('修正(U)')).toBeInTheDocument();
    expect(screen.getByText('削除(D)')).toBeInTheDocument();
  });

  it('SYS_ADMINカラムに「(常にON)」テキストを表示すること', () => {
    renderMatrix();
    expect(screen.getByText('(常にON)')).toBeInTheDocument();
  });

  it('閲覧専用機能に「(閲覧専用)」ラベルを表示すること', () => {
    renderMatrix();
    const viewOnlyLabels = screen.getAllByText('(閲覧専用)');
    expect(viewOnlyLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('編集可能セルのクリックで onToggle が機能ID/ロール/アクションを伴って呼ばれること', async () => {
    const user = userEvent.setup();
    const onToggle = renderMatrix();

    // DOM 先頭の「参照 OFF」= 先頭機能(products) × 先頭編集ロール(WH_USER) × view
    const viewOffButtons = screen
      .getAllByTitle('参照 OFF')
      .filter((b) => !b.hasAttribute('disabled'));
    expect(viewOffButtons.length).toBeGreaterThan(0);
    await user.click(viewOffButtons[0]);

    expect(onToggle).toHaveBeenCalledWith('products', 'WH_USER', 'canView');
  });

  it('SYS_ADMIN セルは readOnly（disabled）であること', () => {
    renderMatrix();
    const onButtons = screen.getAllByTitle('参照 ON');
    const disabledOn = onButtons.filter((btn) => btn.hasAttribute('disabled'));
    expect(disabledOn.length).toBeGreaterThan(0);
  });

  it('SYS_ADMIN 専用機能 (permissions/system-parameters) は他 role でも操作不可であること', () => {
    renderMatrix();
    const offButtons = screen.getAllByTitle('参照 OFF');
    const disabledOff = offButtons.filter((btn) => btn.hasAttribute('disabled'));
    // permissions / system-parameters x 4 編集 role x view = 8 件以上の disabled OFF
    expect(disabledOff.length).toBeGreaterThanOrEqual(8);
  });

  it('動的台帳は閲覧OFFの間、書込トグルだけdisabledであること', () => {
    const features = buildLogicalFeatures([
      { key: 'supplier-score', name: '仕入先評価', sortOrder: 6, isPreset: false },
    ]);
    render(
      <PermissionMatrix
        matrix={buildMatrix([], features)}
        features={features}
        onToggle={vi.fn()}
      />,
    );

    const row = screen.getByText('仕入先評価').closest('tr');
    expect(row).not.toBeNull();
    const viewButtons = within(row!).getAllByTitle('参照 OFF');
    const writeButtons = [
      ...within(row!).getAllByTitle('登録 OFF'),
      ...within(row!).getAllByTitle('修正 OFF'),
      ...within(row!).getAllByTitle('削除 OFF'),
    ];
    expect(viewButtons).toHaveLength(4);
    expect(writeButtons).toHaveLength(12);
    viewButtons.forEach((button) => expect(button).toBeEnabled());
    writeButtons.forEach((button) => expect(button).toBeDisabled());
  });
});
