import { PrismaClient, Group } from '@prisma/client';

interface SeedAnnouncementsArgs {
  creatorUserId: string;
  groups: Group[];
}

interface AnnouncementDef {
  title: string;
  bodyMarkdown: string;
  isNew: boolean;
  isImportant: boolean;
  notifiedDaysAgo: number;
  // 空配列 = 全ユーザー可視（roles 0 件）。グループ code 配列指定でそのグループのみ可視
  visibleToGroupCodes: string[];
}

const ANNOUNCEMENT_DEFS: AnnouncementDef[] = [
  {
    title: '【重要】システムメンテナンスのお知らせ（2026/05/15 22:00 - 24:00）',
    bodyMarkdown: `## メンテナンス概要

下記日程で **StructPass** のメンテナンスを実施します。
作業時間中は一時的にシステムへアクセスできなくなりますので、ご注意ください。

### 日時
- **2026年5月15日（金）22:00 〜 24:00（予定）**

### 影響範囲
- 全モジュール（在庫・出荷・受入・棚卸など）
- API アクセス全般

### 作業内容
- データベース定期バックアップ
- セキュリティパッチ適用
- 一部モジュールのバージョンアップ

ご不便をおかけしますが、ご理解のほどよろしくお願いいたします。`,
    isNew: true,
    isImportant: true,
    notifiedDaysAgo: 0,
    visibleToGroupCodes: [],
  },
  {
    title: '在庫予測アラート機能をリリースしました',
    bodyMarkdown: `ダッシュボードに **在庫不足リスクのアラート表示** が追加されました。

## 主な機能

- 過去の出荷ペースから将来の在庫切れを予測
- 不足リスクのある商品を一覧でハイライト
- ダッシュボード上部に件数バッジ表示

詳細は \`/dashboard/forecast\` をご確認ください。

> ※ 本機能はベータ版です。お気づきの点があれば管理者までフィードバックをお寄せください。`,
    isNew: true,
    isImportant: false,
    notifiedDaysAgo: 1,
    visibleToGroupCodes: [],
  },
  {
    title: '倉庫チーム向け：棚卸し作業手順の更新',
    bodyMarkdown: `倉庫チーム各位

棚卸し作業の標準手順書を改訂しました。次回棚卸しから新手順を適用します。

## 主な変更点

1. **ロケーション順スキャン** を必須化
2. 差異が **5%超** の場合は再カウントを義務付け
3. 完了後の承認フローを 2 段階制に変更

不明点は倉庫管理担当（wh-admin）までお問い合わせください。`,
    isNew: true,
    isImportant: false,
    notifiedDaysAgo: 2,
    visibleToGroupCodes: ['GRP-WH', 'GRP-STOCK'],
  },
  {
    title: '事務チーム：請求書発行スケジュール変更',
    bodyMarkdown: `事務チームの皆様

5月度より、月次請求書発行の締め日を **月末最終営業日** から **25日** に前倒しします。

| 項目 | 旧 | 新 |
|------|----|----|
| 締め日 | 月末最終営業日 | 毎月25日 |
| 発行日 | 翌月3営業日 | 翌月1営業日 |
| 入金期日 | 翌月末 | 翌月末（変更なし） |

ご対応のほどよろしくお願いいたします。`,
    isNew: false,
    isImportant: true,
    notifiedDaysAgo: 5,
    visibleToGroupCodes: ['GRP-OF', 'GRP-ACCOUNTS'],
  },
  {
    title: '新機能：ユーザーお気に入り機能のご案内',
    bodyMarkdown: `各画面の右上にある ⭐ アイコンから、よく使う一覧画面をお気に入り登録できるようになりました。

## 使い方

1. 一覧画面（商品/受入/出荷など）の上部 ⭐ をクリック
2. サイドバーの「お気に入り」セクションに追加されます
3. 並び替え・削除も可能

業務効率化にぜひご活用ください。`,
    isNew: false,
    isImportant: false,
    notifiedDaysAgo: 7,
    visibleToGroupCodes: [],
  },
  {
    title: 'IT チーム：バックアップ運用の見直し',
    bodyMarkdown: `IT チーム各位

データベースバックアップの運用を以下のとおり見直します。

- **頻度**: 日次 → 6時間おき
- **保持期間**: 30日 → 90日
- **検証**: 月1回 → 週1回

詳細手順は社内 Wiki の「DB Backup Runbook」を参照してください。`,
    isNew: false,
    isImportant: false,
    notifiedDaysAgo: 10,
    visibleToGroupCodes: ['GRP-IT'],
  },
  {
    title: 'パスワードポリシー強化のお願い',
    bodyMarkdown: `セキュリティ強化のため、全ユーザーのパスワードを以下の基準を満たすものへ変更してください。

## 新パスワードポリシー

- **8文字以上**
- 英大文字・英小文字・数字・記号を **全て含む**
- 過去 5 世代と異なる

\`マイページ → パスワード変更\` から更新可能です。

> 期限: **2026年5月末日まで**

期限を過ぎても未変更の場合、次回ログイン時に強制的に変更画面へ遷移します。`,
    isNew: false,
    isImportant: true,
    notifiedDaysAgo: 14,
    visibleToGroupCodes: [],
  },
  {
    title: 'ヤマト運輸さま 集荷時間変更のご連絡',
    bodyMarkdown: `物流チーム各位

ヤマト運輸さまの集荷時間が変更となります。

- **旧**: 16:00
- **新**: 15:30

出荷準備の前倒しをお願いいたします。`,
    isNew: false,
    isImportant: false,
    notifiedDaysAgo: 18,
    visibleToGroupCodes: ['GRP-LOGISTICS', 'GRP-WH'],
  },
  {
    title: '社内研修：ECC ワークフロー勉強会のご案内',
    bodyMarkdown: `## 開催概要

- **日時**: 2026年5月20日（火）15:00 - 17:00
- **場所**: 本社 3F 大会議室 / オンライン併用
- **対象**: 全社員（任意参加）

## アジェンダ

1. ECC（Explore-Code-Commit）の基本
2. 並列エージェント実行のベストプラクティス
3. Q&A

事前登録は不要です。お気軽にご参加ください。`,
    isNew: false,
    isImportant: false,
    notifiedDaysAgo: 21,
    visibleToGroupCodes: [],
  },
  {
    title: '【アーカイブ】2026年4月リリースノート',
    bodyMarkdown: `## 2026年4月の主なリリース

### 新機能
- 掲示板機能の追加
- ユーザーお気に入り機能
- テーブルカラム幅のユーザー別保存

### 改善
- 一覧画面のページサイズ選択
- サイドバーのデザイン刷新
- ダークモード対応の調整

### バグ修正
- 受入登録時の数量バリデーション
- 出荷一覧のフィルター挙動
- 棚卸しの差異計算

詳細は社内 GitHub の \`CHANGELOG.md\` を参照してください。`,
    isNew: false,
    isImportant: false,
    notifiedDaysAgo: 30,
    visibleToGroupCodes: [],
  },
];

export async function seedAnnouncements(
  prisma: PrismaClient,
  args: SeedAnnouncementsArgs,
): Promise<void> {
  const { creatorUserId, groups } = args;

  // 既存掲示は全削除して再投入（child の AnnouncementRole / AnnouncementAttachment は cascade）
  await prisma.announcement.deleteMany();

  const groupByCode = new Map(groups.map((g) => [g.code, g]));
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < ANNOUNCEMENT_DEFS.length; i++) {
    const def = ANNOUNCEMENT_DEFS[i];
    const notifiedAt = new Date(now - def.notifiedDaysAgo * dayMs);
    // 配列順 = 表示順となるよう sortOrder を負方向に並べる（先頭が最も小さい値）
    const sortOrder = -(ANNOUNCEMENT_DEFS.length - i);

    const roleGroupIds = def.visibleToGroupCodes
      .map((code) => groupByCode.get(code)?.id)
      .filter((id): id is number => typeof id === 'number');

    await prisma.announcement.create({
      data: {
        title: def.title,
        bodyMarkdown: def.bodyMarkdown,
        isNew: def.isNew,
        isImportant: def.isImportant,
        notifiedAt,
        sortOrder,
        createdById: creatorUserId,
        roles: {
          create: roleGroupIds.map((groupId) => ({ groupId })),
        },
      },
    });
  }

  console.log('Announcements created:', ANNOUNCEMENT_DEFS.length);
}
