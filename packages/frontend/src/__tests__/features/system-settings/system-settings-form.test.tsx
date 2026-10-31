import { useCallback, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemSettingsForm } from '@/features/system-settings/components/system-settings-form';
import { THEME_KEY } from '@/features/theme';
import type { SystemSetting } from '@struct-pass/shared';

// SystemSettingsForm は presentational（描画専任）で、drafts/dirtyKeys は親が保持する。
// 実挙動（ページ側）に合わせ、drafts を state で持ち onChange で更新する Harness を
// 使って「入力 → 表示へ反映 → onChange 伝播」の境界を検証する。
function Harness({
  settings,
  onChange = vi.fn(),
}: {
  settings: SystemSetting[];
  onChange?: (key: string, value: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const handleChange = useCallback(
    (key: string, value: string) => {
      setDrafts((d) => ({ ...d, [key]: value }));
      onChange(key, value);
    },
    [onChange],
  );
  return (
    <SystemSettingsForm
      settings={settings}
      drafts={drafts}
      dirtyKeys={Object.keys(drafts)}
      onChange={handleChange}
    />
  );
}

function makeSetting(overrides: Partial<SystemSetting> = {}): SystemSetting {
  return {
    key: 'k',
    label: '項目',
    description: '',
    value: 'v1',
    valueType: 'STRING',
    category: 'general',
    sortOrder: 1,
    ...overrides,
  } as SystemSetting;
}

const settings: SystemSetting[] = [
  makeSetting({ key: 'b', label: 'ベータ', sortOrder: 2 }),
  makeSetting({ key: 'a', label: 'アルファ', sortOrder: 1 }),
  makeSetting({ key: THEME_KEY, label: 'UIテーマ', valueType: 'STRING', sortOrder: 99 }),
  makeSetting({
    key: 'flag',
    label: 'フラグ',
    value: 'false',
    valueType: 'BOOLEAN',
    sortOrder: 3,
  }),
  makeSetting({ key: 'count', label: '件数', value: '5', valueType: 'NUMBER', sortOrder: 4 }),
];

describe('SystemSettingsForm', () => {
  it('テーマ設定が表示順・sortOrder に関係なく先頭に固定されること', () => {
    render(
      <SystemSettingsForm settings={settings} drafts={{}} dirtyKeys={[]} onChange={vi.fn()} />,
    );

    const rows = screen.getAllByRole('row').slice(1); // thead を除く
    expect(rows[0]).toHaveTextContent('UIテーマ');
    // 以降は sortOrder → label 順（アルファ、ベータ、フラグ、件数）
    expect(rows[1]).toHaveTextContent('アルファ');
    expect(rows[2]).toHaveTextContent('ベータ');
    expect(rows[3]).toHaveTextContent('フラグ');
    expect(rows[4]).toHaveTextContent('件数');
  });

  it('dirtyKeys に含まれる設定へ未保存マーカーが付くこと', () => {
    render(
      <SystemSettingsForm
        settings={[makeSetting({ key: 'a', label: 'アルファ' })]}
        drafts={{ a: '新値' }}
        dirtyKeys={['a']}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('●未保存')).toBeInTheDocument();
  });

  it('dirtyKeys に無い設定には未保存マーカーが付かないこと', () => {
    render(
      <SystemSettingsForm
        settings={[makeSetting({ key: 'a', label: 'アルファ' })]}
        drafts={{}}
        dirtyKeys={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('●未保存')).not.toBeInTheDocument();
  });

  it('テキスト入力の変更が onChange(key, value) として伝播すること', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness
        settings={[makeSetting({ key: 'a', label: 'アルファ', value: '旧値' })]}
        onChange={onChange}
      />,
    );

    const input = screen.getByDisplayValue('旧値');
    await user.clear(input);
    await user.type(input, '新値');

    expect(screen.getByDisplayValue('新値')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith('a', '新値');
  });

  it('NUMBER 型は number input で、変更が文字列として伝播すること', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness
        settings={[makeSetting({ key: 'count', label: '件数', value: '5', valueType: 'NUMBER' })]}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '7');

    expect(screen.getByDisplayValue('7')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith('count', '7');
  });

  it('drafts に値があれば設定値より優先して表示されること', () => {
    render(
      <SystemSettingsForm
        settings={[makeSetting({ key: 'a', label: 'アルファ', value: '保存済み' })]}
        drafts={{ a: '編集中' }}
        dirtyKeys={['a']}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('編集中')).toBeInTheDocument();
  });
});
