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

// 表示は日本時間の日付で固定する（d644）。日付を跨がない正午の ISO だけを見ていると、
// 実装が閲覧者の端末の時計に従っても・UTC のままでも緑になり、境界のずれを検知できない。
// よって下の describe で、UTC の日付と日本時間の日付がずれる時刻（UTC 14:59 / 15:00 の
// 前後）を固定する。
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

/** `2026/08/02` を、その日付だけに一致する正規表現にする（部分一致を避ける）。 */
function datePattern(ymd: string): RegExp {
  return new RegExp(`^${ymd.replace(/\//g, '\\/')}$`);
}

// d808: 日本時間の日付境界を跨ぐ事例が無かった。テストの時間軸は TZ=UTC に固定されており
// （vitest.config.ts）、UTC の日付と日本時間の日付がずれる時刻を置くことで、表示が
// 「端末の時計」でも「UTC」でもないことを固定する。
describe('AnnouncementListItemRow の通知日（日本時間の日付境界・d808）', () => {
  // 4 件とも「日本時間の日付」と「UTC の日付」が**違う日付になる**時刻だけを置く。
  // 両者が同じになる時刻（例: 日本時間 09:00 は UTC でも同日）を混ぜると、実装が UTC のままでも
  // 緑になり、境界の試験として効かない（独立の目の指摘で確認）。
  const boundaryCases = [
    {
      label: '日本時間の 00:00 ちょうどは当日 8/2（UTC では 8/1 の 15:00）',
      notifiedAt: '2026-08-01T15:00:00Z',
      expected: '2026/08/02',
    },
    {
      label: '日本時間の 23:59 は 8/2 のまま（UTC では 8/2 の 14:59）',
      notifiedAt: '2026-08-02T14:59:59Z',
      expected: '2026/08/02',
    },
    {
      label: '日本時間の 00:00 の直前は前日 7/31（UTC では 8/1 の 14:59）',
      notifiedAt: '2026-07-31T14:59:59Z',
      expected: '2026/07/31',
    },
    {
      label: '日本時間の 00:00 ちょうどは 8/3（UTC では 8/2 の 15:00・前日側）',
      notifiedAt: '2026-08-02T15:00:00Z',
      expected: '2026/08/03',
    },
  ];

  for (const { label, notifiedAt, expected } of boundaryCases) {
    it(`${label} → ${expected}`, () => {
      render(
        <ul>
          <AnnouncementListItemRow
            item={{ ...item, notifiedAt }}
            selected={false}
            onSelect={vi.fn()}
          />
        </ul>,
      );

      // 行に出す日付は 1 つだけなので、完全一致で「日本時間の日付」が出ていることを固定する。
      // 4 件とも UTC と日本時間で日付が違う時刻なので、UTC のままの実装ではこの一致が外れる
      // （＝この 1 行が「端末の時計・UTC ではなく日本時間で出している」ことの判定になる）。
      expect(screen.getByText(datePattern(expected))).toBeInTheDocument();
    });
  }
});
