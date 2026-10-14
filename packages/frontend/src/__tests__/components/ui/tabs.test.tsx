import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

describe('Tabs', () => {
  it('defaultValueのタブコンテンツを表示すること', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">タブ1</TabsTrigger>
          <TabsTrigger value="tab2">タブ2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">コンテンツ1</TabsContent>
        <TabsContent value="tab2">コンテンツ2</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('コンテンツ1')).toBeInTheDocument();
    expect(screen.queryByText('コンテンツ2')).not.toBeInTheDocument();
  });

  it('タブクリックでコンテンツが切り替わること', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">タブ1</TabsTrigger>
          <TabsTrigger value="tab2">タブ2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">コンテンツ1</TabsContent>
        <TabsContent value="tab2">コンテンツ2</TabsContent>
      </Tabs>,
    );

    await user.click(screen.getByText('タブ2'));
    expect(screen.queryByText('コンテンツ1')).not.toBeInTheDocument();
    expect(screen.getByText('コンテンツ2')).toBeInTheDocument();
  });

  it('制御モード(value)で動作すること', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Tabs value="tab1" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">タブ1</TabsTrigger>
          <TabsTrigger value="tab2">タブ2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">コンテンツ1</TabsContent>
        <TabsContent value="tab2">コンテンツ2</TabsContent>
      </Tabs>,
    );

    await user.click(screen.getByText('タブ2'));
    expect(onValueChange).toHaveBeenCalledWith('tab2');
  });

  it('アクティブタブにaria-selected=trueが設定されること', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">タブ1</TabsTrigger>
          <TabsTrigger value="tab2">タブ2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">コンテンツ1</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText('タブ1')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('タブ2')).toHaveAttribute('aria-selected', 'false');
  });

  it('TabsContentにrole=tabpanelが設定されること', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">タブ1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">コンテンツ</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('TabsListにrole=tablistが設定されること', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">タブ1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">コンテンツ</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
