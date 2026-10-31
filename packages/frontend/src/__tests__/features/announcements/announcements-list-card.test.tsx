import { render, screen } from '@testing-library/react';
import { AnnouncementsListCard } from '@/features/announcements/components/announcements-list-card';

const onSelect = vi.fn();

// d789: 掲示板の検索で 0 件になった時に「掲示板が見つかりませんでした（まだ何も無い）」と
// 読み違えさせない。並び替え・選択は検索無しの経路なので、空表示の分岐だけを確かめる。
describe('AnnouncementsListCard', () => {
  it('検索条件が無い時の 0 件は「掲示板が見つかりませんでした」と出すこと', () => {
    render(<AnnouncementsListCard items={[]} selectedId={null} onSelect={onSelect} />);
    expect(screen.getByText('掲示板が見つかりませんでした')).toBeInTheDocument();
    expect(screen.queryByText('条件に合う掲示板がありませんでした')).toBeNull();
  });

  it('検索条件が入っている時の 0 件は条件に合わなかった旨を出すこと', () => {
    render(<AnnouncementsListCard items={[]} selectedId={null} onSelect={onSelect} filtered />);
    expect(screen.getByText('条件に合う掲示板がありませんでした')).toBeInTheDocument();
    expect(screen.queryByText('掲示板が見つかりませんでした')).toBeNull();
  });
});
