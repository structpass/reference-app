# はじめに

> この環境を受け取った日に、最初に読むドキュメントです。

---

## この環境は何か

Struct Pass のリファレンス実装 — **商品管理システムの完全なフルスタック実装**です。

コードだけではありません。開発文化（ワークフロー、品質基準、AIとの協働ルール）とインフラ（Docker、HTTPS、CI/CD）を含めた**開発の土台そのもの**を提供しています。

```
┌──────────────────────────────────────┐
│  開発文化（AGENTS.md / ドキュメント群） │
├──────────────────────────────────────┤
│  アプリケーション（Next.js / NestJS）  │
├──────────────────────────────────────┤
│  インフラ（Docker / Caddy / EC2）     │
└──────────────────────────────────────┘
```

---

## まず動かす（15分）

### 必要なもの

- Node.js 24.x 以上（版の正本は `.nvmrc`）
- pnpm 9.x 以上
- Docker & Docker Compose
- 起動済みの rete（OIDC IdP）。rete の起動手順は、rete の公開版リポジトリ（GitHub: structpass/rete-app）の README『開発』セクションを参照

reference は rete を **IdP**（認証を担うシステム）として利用します。
reference だけを起動してもログインできないため、先に rete の frontend と backend を起動してください。

### 手順

```bash
git clone <repository-url>
cd struct-pass-reference
pnpm install
cp .env.example .env            # 開発用の DB パスワードと JWT_SECRET（docker compose が読む）
docker compose up -d postgres   # PostgreSQL を起動（127.0.0.1 にのみ公開）
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.local.example packages/frontend/.env.local
pnpm --filter @struct-pass/backend prisma:migrate
pnpm --filter @struct-pass/backend prisma:seed
pnpm dev                        # 開発サーバー起動
```

開発用の PostgreSQL は `.env` の `POSTGRES_PASSWORD` を必須とし（既定値を持たず、未設定では起動しません）、ホストの `127.0.0.1` にのみ公開します。
`packages/backend/.env` の `DATABASE_URL` は host に `127.0.0.1` を使います。パスワードは、新しく作る開発 DB では `.env` の `POSTGRES_PASSWORD` と同じ値に、作成済みの開発 DB では初期化時の値（`packages/backend/.env` に書かれている値）に合わせてください。

`packages/backend/.env` の `OIDC_ISSUER`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI` は、rete 側の OIDC client 設定と一致させます。
値が一致しない場合、rete から reference へログインできません。

rete 側で reference との OIDC client が有効になるのは、rete の `.env` で `OIDC_REFERENCE_CLIENT_SECRET` と `OIDC_REFERENCE_REDIRECT_URIS` の両方を設定した時です。両側（rete / reference）の設定の対応関係の正本は、rete リポジトリの `packages/backend/.env.example`『OIDC Relying Party』セクションを参照してください。

ブラウザで http://localhost:3000 にアクセスすると、ログイン処理のため rete へ移動します。
OIDC の認証フローは [ARCHITECTURE.md](../02-architecture/ARCHITECTURE.md#認証フロー) を参照してください。

### デモユーザー

rete で次のアカウントとしてログインすると、reference では対応するロールが割り当てられます。

| rete アカウント              | 表示名         | reference ロール |
| ---------------------------- | -------------- | ---------------- |
| admin@rete.local             | システム管理者 | SYS_ADMIN        |
| wh-user@struct-pass.example  | 倉庫 一郎      | WH_USER          |
| wh-admin@struct-pass.example | 倉庫 管理太郎  | WH_ADMIN         |
| of-user@struct-pass.example  | 事務 花子      | OF_USER          |
| of-admin@struct-pass.example | 事務 管理子    | OF_ADMIN         |
| tanaka@struct-pass.example   | 田中 太郎      | WH_ADMIN         |

※ 管理者の email は rete の `SEED_ADMIN_EMAIL` で変更できます（未設定なら `admin@rete.local`）。reference との紐付けは email でなく `sub`（`Account.id` = OIDC `sub` = `User.oidcSub`）で行うため、email が一致しなくてもログインできます。

reference の seed はパスワードを保持しません。
rete の `Account.id`、OIDC の `sub`、reference の `User.oidcSub` を一致させてください。
実体の正本は `packages/backend/prisma/seed/users.ts` です。

詳細な環境構築手順: [DEVELOPMENT_GUIDE.md](../04-development/DEVELOPMENT_GUIDE.md)

---

## 次に読むもの

### 目的別の読み順

| やりたいこと                 | 読むドキュメント                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **業務の全体像を知りたい**   | [CONCEPTUAL_DESIGN.md](./CONCEPTUAL_DESIGN.md)                                                                        |
| **設計思想を理解したい**     | [ARCHITECTURE_OVERVIEW.md](../02-architecture/ARCHITECTURE_OVERVIEW.md)                                               |
| **AIとの協働を理解したい**   | [AGENTS.md](../../AGENTS.md) → [AI_HUMAN_ROLES.md](../04-development/AI_HUMAN_ROLES.md)                               |
| **開発を始めたい**           | [DEVELOPMENT_METHODOLOGY.md](../04-development/DEVELOPMENT_METHODOLOGY.md) → [CONTRIBUTING.md](../../CONTRIBUTING.md) |
| **DB 構造を知りたい**        | [DATABASE_SCHEMA.md](../02-architecture/DATABASE_SCHEMA.md)                                                           |
| **API 仕様を確認したい**     | [API_REFERENCE.md](../02-architecture/API_REFERENCE.md)                                                               |
| **機能仕様を確認したい**     | [features/FEATURE_LIST.md](../03-features/FEATURE_LIST.md)                                                            |
| **権限の仕組みを知りたい**   | [USER_ROLES.md](../02-architecture/USER_ROLES.md)                                                                     |
| **テスト方針を知りたい**     | [TESTING_STRATEGY.md](../04-development/TESTING_STRATEGY.md)                                                          |
| **セキュリティを確認したい** | [SECURITY.md](../04-development/SECURITY.md)                                                                          |
| **新しい機能を追加したい**   | [EXTENSION_GUIDE.md](../04-development/EXTENSION_GUIDE.md)                                                            |
| **本番にデプロイしたい**     | [DEPLOYMENT.md](../04-development/DEPLOYMENT.md)                                                                      |

### 推奨する読み順（初めての場合）

1. **ARCHITECTURE_OVERVIEW.md** — なぜこの構成なのかを把握
2. **AI_HUMAN_ROLES.md** — AIと人間の役割分担を理解
3. **DEVELOPMENT_METHODOLOGY.md** — 日々の開発プロセスを知る
4. **SECURITY.md** — セキュリティ対策を確認
5. あとは必要に応じて

---

## ドキュメント一覧

### 上位（なぜ・どう）

| ドキュメント                                                               | 内容                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------ |
| [CONCEPTUAL_DESIGN.md](./CONCEPTUAL_DESIGN.md)                             | 業務フロー、機能マップ、画面遷移、ステータス遷移 |
| [ARCHITECTURE_OVERVIEW.md](../02-architecture/ARCHITECTURE_OVERVIEW.md)    | 設計思想、構造の意図、インフラ選択理由           |
| [AI_HUMAN_ROLES.md](../04-development/AI_HUMAN_ROLES.md)                   | AIと人間の役割分担、AGENTS.mdとの関係            |
| [DEVELOPMENT_METHODOLOGY.md](../04-development/DEVELOPMENT_METHODOLOGY.md) | TDD、規模別プロセス、品質チェック、Git 運用      |

### 技術詳細（何を）

| ドキュメント                                                | 内容                                   |
| ----------------------------------------------------------- | -------------------------------------- |
| [ARCHITECTURE.md](../02-architecture/ARCHITECTURE.md)       | 技術選定、モジュール構成、データフロー |
| [DATABASE_SCHEMA.md](../02-architecture/DATABASE_SCHEMA.md) | ER図、テーブル定義、Enum               |
| [API_REFERENCE.md](../02-architecture/API_REFERENCE.md)     | API エンドポイント仕様                 |
| [USER_ROLES.md](../02-architecture/USER_ROLES.md)           | 5ロール体系、CRUD 権限マトリクス       |
| [features/FEATURE_LIST.md](../03-features/FEATURE_LIST.md)  | 全 30 機能の一覧                       |

### 開発・運用

| ドキュメント                                                   | 内容                                      |
| -------------------------------------------------------------- | ----------------------------------------- |
| [DEVELOPMENT_GUIDE.md](../04-development/DEVELOPMENT_GUIDE.md) | 環境構築手順、開発コマンド                |
| [CONTRIBUTING.md](../../CONTRIBUTING.md)                       | Git フロー、コミット規約、PR テンプレート |
| [TESTING_STRATEGY.md](../04-development/TESTING_STRATEGY.md)   | テスト設計方針、カバレッジ方針            |
| [SECURITY.md](../04-development/SECURITY.md)                   | セキュリティ対策、監査記録                |
| [EXTENSION_GUIDE.md](../04-development/EXTENSION_GUIDE.md)     | 新しい機能の追加手順                      |
| [DEPLOYMENT.md](../04-development/DEPLOYMENT.md)               | 本番デプロイ手順                          |
| [AGENTS.md](../../AGENTS.md)                                   | Codexが常時読むリポジトリ作業規約         |

---

## 「卒業」のイメージ

この環境は、最終的にあなたのチームが自分たちのものにすることを前提に設計されています。

- **AGENTS.md を書き換える** — 自社のCodex作業規約と品質基準に合わせる
- **CONTRIBUTING.md を変える** — 自社の Git フロー、コーディング規約に合わせる
- **デプロイ先を変える** — Docker Compose があればどこでも動く
- **機能を追加・削除する** — 30機能は出発点。自社の業務に合わせてカスタマイズする
- **AI を使わない選択もできる** — AGENTS.mdを使わなくてもアプリ自体は動く

**この環境が「あなたのもの」になったとき、Struct Pass の役割は終わりです。**
