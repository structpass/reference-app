import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnouncementListItemRow } from '@/features/announcements/components/announcement-list-item';

// dnd-kit の useSortable はドラッグ実装に深く依存するため、行の表示/操作検証では
// ハンドル属性とドラッグ状態の形だけモックする（実ドラッグ挙動は DnD 専用テストの対象）。
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// 日付は jsdom（UTC）と実ブラウザ（JST）で日付が変わり得るため、タイムゾーン差が
// 日付を跨がない正午の ISO を使う（2026-08-01T12:00:00+09:00 = UTC 03:00 でも同日）。
const item = {
  id: 1,
  title: '夏期休業のお知らせ',
  bodyMarkdown: '本文',
  notifiedAt: '2026-08-01T12:00:00+09:00',
  sortOrder: 1,
  isNew: true,
  isImportant: false,
};

describe('AnnouncementListItemRow', () => {
  it('タイトルと通知日を表示し、クリックで onSelect が呼ばれること', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ul>
        <AnnouncementListItemRow item={item} selected={false} onSelect={onSelect} />
      </ul>,
    );

    expect(screen.getByText('夏期休業のお知らせ')).toBeInTheDocument();
    // formatDate は ja-JP の toLocaleDateString（例: 2026/08/01）
    expect(screen.getByText(/2026\/08\/01/)).toBeInTheDocument();

    await user.click(screen.getByText('夏期休業のお知らせ'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('isImportant の行に重要バッジ、isNew の行に New バッジが表示されること', () => {
    render(
      <ul>
        <AnnouncementListItemRow
          item={{ ...item, isImportant: true, isNew: true }}
          selected={false}
          onSelect={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText('重要')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('バッジ無しの行には重要/New が表示されないこと', () => {
    render(
      <ul>
        <AnnouncementListItemRow
          item={{ ...item, isImportant: false, isNew: false }}
          selected={false}
          onSelect={vi.fn()}
        />
      </ul>,
    );

    expect(screen.queryByText('重要')).not.toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('canReorder の時は並び替えハンドルが表示されること', () => {
    render(
      <ul>
        <AnnouncementListItemRow item={item} selected={false} onSelect={vi.fn()} canReorder />
      </ul>,
    );
    expect(screen.getByRole('button', { name: '並び替え' })).toBeInTheDocument();
  });

  it('canReorder 無しの時は並び替えハンドルが表示されないこと', () => {
    render(
      <ul>
        <AnnouncementListItemRow item={item} selected={false} onSelect={vi.fn()} />
      </ul>,
    );
    expect(screen.queryByRole('button', { name: '並び替え' })).not.toBeInTheDocument();
  });

  it('canManage かつ onDelete 指定の時は削除ボタンが表示され、押下で onDelete が呼ばれること', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ul>
        <AnnouncementListItemRow
          item={item}
          selected={false}
          onSelect={vi.fn()}
          canManage
          onDelete={onDelete}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('canManage でも onDelete 未指定の時は削除ボタンが表示されないこと', () => {
    render(
      <ul>
        <AnnouncementListItemRow item={item} selected={false} onSelect={vi.fn()} canManage />
      </ul>,
    );
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
  });

  it('選択中は選択スタイルのクラスが付くこと', () => {
    render(
      <ul>
        <AnnouncementListItemRow item={item} selected onSelect={vi.fn()} />
      </ul>,
    );
    const row = screen.getByText('夏期休業のお知らせ').closest('li');
    expect(row).toHaveClass('bg-[var(--sp-accent-soft)]');
  });
});
