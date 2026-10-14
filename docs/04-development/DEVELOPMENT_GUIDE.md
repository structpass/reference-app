# 開発ガイド

## 環境構築

### 必要要件

- Node.js 24.x 以上（版の正本は `.nvmrc`。`.nvmrc`・`engines`・本番イメージの base がずれていないかは `pnpm run check:node-version` で確認する）
- pnpm 9.x 以上
- Docker & Docker Compose
- Git
- 起動済みの rete（OIDC IdP）

### セットアップ手順

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd struct-pass-reference

# 2. 依存関係をインストール
pnpm install

# 3. 開発用の環境変数を用意（docker compose が root の .env を自動で読む）
cp .env.example .env

# 4. Docker で PostgreSQL を起動
docker compose up -d postgres

# 5. 環境変数を設定
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.local.example packages/frontend/.env.local
# frontend では NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_SUBTITLE / NEXT_PUBLIC_APP_ENV を
# 譲渡先環境に合わせて編集（branding / 環境バッジで参照）。詳細は本書「環境変数」節を参照。
# backend の OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET / OIDC_REDIRECT_URI を
# rete 側の OIDC client 設定と一致させる

# 6. データベースマイグレーション
pnpm --filter @struct-pass/backend prisma:migrate

# 7. シードデータ投入
pnpm --filter @struct-pass/backend prisma:seed

# 8. 開発サーバー起動
pnpm dev
```

### 開発用 DB の公開範囲と認証情報

- postgres は `127.0.0.1:5432` にのみ公開します。ホストの開発サーバー（`pnpm dev`）からは届き、同じ LAN の他端末からは届きません。
- `POSTGRES_PASSWORD` は既定値を持ちません。未設定のままでは `docker compose` が起動前に停止するため、開発用の値は root の `.env` に明示します（`cp .env.example .env`）。
- `packages/backend/.env` の `DATABASE_URL` は同じパスワードと host `127.0.0.1` を使います（`localhost` は `::1` に解決される環境があり、ループバック公開の DB には届きません）。
  新しく作る開発 DB の例: `postgresql://postgres:CHANGE_ME_dev_db_password@127.0.0.1:5432/struct_pass_dev?schema=public`
- `POSTGRES_PASSWORD` が効くのはコンテナの初回作成（initdb）時だけです。作成済みの開発 DB には初期化時のパスワードが残るため、既にボリュームがある開発機では `packages/backend/.env` の `DATABASE_URL` に書かれている値を `.env` の `POSTGRES_PASSWORD` に入れてください。既存値を新しい値へ変えるには DB 内の操作（`ALTER USER`）かボリュームの作り直し（開発データの消去）が要ります。

## 環境変数

### Frontend (`packages/frontend/.env.local`)

| 変数                       | 用途                                                                        | 既定値（example）              |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL`      | Backend API のエンドポイント。譲渡先で公開 URL に書き換える                 | `http://localhost:3001/api/v1` |
| `NEXT_PUBLIC_APP_ENV`      | header に表示する環境識別バッジ（`development` / `staging` / `production`） | `development`                  |
| `NEXT_PUBLIC_APP_NAME`     | login / sidebar / `<title>` で参照されるアプリ名                            | `Struct Pass`                  |
| `NEXT_PUBLIC_APP_SUBTITLE` | login / sidebar に表示されるサブタイトル                                    | `商品管理システム`             |

`NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_SUBTITLE` を譲渡先のブランド名に書き換えるだけで、コード変更なしに UI 表記が切り替わります。

### Backend (`packages/backend/.env`)

詳細は `packages/backend/.env.example` を参照してください。
`DATABASE_URL`、`JWT_SECRET`、`NODE_ENV` に加え、rete 連携用の `OIDC_ISSUER`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI` が必要です。
4 つの OIDC 設定は rete 側の OIDC client 設定と一致させてください。
reference は rete を IdP として利用するため、rete を起動せずに reference だけを起動してもログインできません。
OIDC 設定の両側（rete / reference）の対応関係の正本は [GETTING_STARTED.md](../01-introduction/GETTING_STARTED.md) を参照してください。
認証フローの正本は [ARCHITECTURE.md](../02-architecture/ARCHITECTURE.md#認証フロー) です。

> **注意**: `NODE_ENV` は cookie の `secure` / `sameSite` 設定スイッチを兼ねるため、staging で HTTPS 終端する場合は `NODE_ENV=production` を必ず設定してください。詳細は `packages/backend/src/modules/auth/constants/cookie.constants.ts` のコメント参照。

## 開発コマンド

### 全体

| コマンド        | 説明                             |
| --------------- | -------------------------------- |
| `pnpm dev`      | 全パッケージの開発サーバーを起動 |
| `pnpm build`    | 全パッケージをビルド             |
| `pnpm lint`     | 全パッケージの Lint チェック     |
| `pnpm test`     | 全パッケージのテスト実行         |
| `pnpm test:cov` | カバレッジ付きテスト             |
| `pnpm clean`    | ビルド成果物を削除               |

### バックエンド固有

```bash
# Prisma Studio（DB GUI）
pnpm --filter @struct-pass/backend prisma:studio

# マイグレーション作成
pnpm --filter @struct-pass/backend prisma:migrate

# シードデータ投入
pnpm --filter @struct-pass/backend prisma:seed

# テスト（カバレッジ付き）
pnpm --filter @struct-pass/backend test:cov
```

## コーディング規約

### TypeScript

- strict モードを有効化
- `any` 型の使用禁止（やむを得ない場合は `unknown` を検討）
- インターフェースは明示的に定義
- enum は Prisma 生成のものを使用

### NestJS パターン

- **Controller**: リクエスト/レスポンスの処理のみ。ビジネスロジックは Service に委譲
- **Service**: ビジネスロジックを実装。DBアクセスはRepository（`modules/*/repositories/*.repository.ts`）経由で行い、Prismaを直接呼ばない。`$transaction`等のORM操作はRepositoryが所有する。詳細は[Architecture invariants](../02-architecture/ARCHITECTURE_INVARIANTS.md)を参照
- **Repository**: Prisma Client を直接利用する唯一の層。クエリ・トランザクションを集約
- **DTO**: class-validator デコレータでバリデーション
- **Guard**: 認証・認可のチェック
- **Interceptor**: 横断的関心事（監査ログ等）

### テスト方針 (TDD)

1. **ユニットテスト**: 各 Service / Controller をモックで独立テスト
2. **E2E テスト**: API エンドポイントの統合テスト
3. **カバレッジ目標**: 80%以上（現在 87%達成）

### Git 規約

- **ブランチ戦略**: `main`を基準とし、必要な場合だけ短命のfeature branchまたはworktreeを使う
- **コミットメッセージ**: Conventional Commits
  - `feat:` 新機能
  - `fix:` バグ修正
  - `docs:` ドキュメント
  - `test:` テスト
  - `refactor:` リファクタリング
  - `chore:` ビルド/ツール

## SSO とデモユーザー

reference はパスワードを保持せず、rete で認証されたユーザーへ reference のロールを割り当てます。
デモユーザーとロールの対応は [GETTING_STARTED.md](../01-introduction/GETTING_STARTED.md#デモユーザー) を参照してください。

seed を変更する場合は、rete の `Account.id`、OIDC の `sub`、reference の `User.oidcSub` を一致させます。
不一致のままログインすると、別ユーザーの作成またはメールアドレスの一意制約違反が起きます。
実体の正本は `packages/backend/prisma/seed/users.ts` です。

## トラブルシューティング

### Docker が起動しない

- Docker Desktop が起動しているか確認
- WSL2 が有効化されているか確認: `wsl --status`
- `POSTGRES_PASSWORD is required` / `JWT_SECRET must be set` は root の `.env` が無い（`cp .env.example .env`）。`docker compose` はファイル全体を展開するため、`up` だけでなく `ps` / `config` もこの状態では停止する

### Prisma マイグレーションエラー

- PostgreSQL コンテナが起動しているか: `docker ps`
- `packages/backend/.env` の `DATABASE_URL` が正しいか確認

### pnpm install エラー

- Node.js のバージョン確認: `node -v` (`.nvmrc` と同じ 24.x)
- pnpm のバージョン確認: `pnpm -v` (9.x 以上)
