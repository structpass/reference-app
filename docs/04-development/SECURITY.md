# セキュリティ方針

> このドキュメントは、セキュリティ監査の結果と、このシステムのセキュリティ設計を記録します。
> ロール・権限の詳細は [USER_ROLES.md](../02-architecture/USER_ROLES.md) を参照してください。

---

## 認証方式

### rete を IdP とする OIDC Authorization Code Flow

reference は認証情報（パスワード・ハッシュ・bcrypt）を保持しません。IdP は rete（`struct-pass-rete`）であり、reference は OAuth 2.0 / OIDC の Relying Party として Authorization Code Flow（PKCE・state・nonce）でユーザー認証を委譲します。フローと API の正本は [ARCHITECTURE.md](../02-architecture/ARCHITECTURE.md#認証フロー) と [API_REFERENCE.md](../02-architecture/API_REFERENCE.md) を参照してください（本ドキュメントはセキュリティ設計の要点を記述する役割分担）。

```
[開始] GET /api/v1/auth/oidc/login
  → PKCE code_verifier / state / nonce を生成し署名 Cookie に退避
  → rete /authorize へ 302 リダイレクト

[再認証] GET /api/v1/auth/oidc/silent-login?return=<同一originのpath>
  → prompt=none で再認証（401 検知時のトップレベル遷移用）

[受領] GET /api/v1/auth/oidc/callback?code=...&state=...
  → state cookie と query state を照合（CSRF 対策）
  → PKCE code_verifier と callback の code を交換して rete から token 取得
  → ID token の nonce を照合（リプレイ対策）
  → claims.sub を reference の User.oidc_sub にリンクし JIT プロビジョニング
  → reference 自前の JWT を HttpOnly Cookie に発行

[ログアウト] POST /api/v1/auth/logout
  → 拒否リストに jti を追加 + Cookie を削除
```

| Cookie 設定  | 値                          | 理由                                            |
| ------------ | --------------------------- | ----------------------------------------------- |
| **HttpOnly** | true                        | JavaScript からアクセス不可（XSS 対策）         |
| **Secure**   | true（本番）                | HTTPS 接続でのみ送信                            |
| **SameSite** | strict（本番）/ lax（開発） | CSRF の基本防御                                 |
| **有効期限** | 1日（デフォルト）           | 環境変数 `JWT_EXPIRES_IN` で変更可能            |
| **Signed**   | true（state cookie）        | Cookie 改竄で state / PKCE を抜かれる経路を断つ |

### reference 自前 JWT（Cookie）

OIDC callback の直後に発行され、以降のリクエストはこの Cookie で認可を回します（rete には都度問い合わせません）。

```typescript
interface JwtPayload {
  sub: string; // reference User.id（OIDC sub と一致）
  jti: string; // トークン ID（必須 — ログアウト時の無効化に使用）
}
```

`jti` は必須。ログアウト時にこの ID を拒否リストへ追加してトークンの再利用を防ぎます。`username` と `role` は payload に載せません。`role` は認可のたびに DB から引き直すため、payload に持つとロール変更の反映が遅延し、毎リクエストの `jwt.strategy` で 1 回 DB を引くコストに見合わないためであり、これは仕様（[ARCHITECTURE.md](../02-architecture/ARCHITECTURE.md) §認証フロー）として固定しています。

### 認証情報の単一ソース

- **reference**: 認証情報を保持しない（SoT は rete）。
- **rete**: IdP。`Account.passwordHash`（Argon2id・`@node-rs/argon2`）と OIDC クライアント（reference 用）を管理。
- パスワード運用（Argon2id パラメータ、初回変更強制、レート制限）は rete 側の責務であり、本ドキュメントの対象外です。

---

## 認可（ロールベースアクセス制御）

5ロール体系で操作権限を制御しています。

| ロール    | 権限の範囲                           |
| --------- | ------------------------------------ |
| WH_USER   | 倉庫系の参照・入力                   |
| WH_ADMIN  | 倉庫系の全操作                       |
| OF_USER   | 事務系の参照・入力                   |
| OF_ADMIN  | 事務系の全操作 + 発注                |
| SYS_ADMIN | 全操作 + ユーザー管理 + システム設定 |

権限マトリクスの詳細は [USER_ROLES.md](../02-architecture/USER_ROLES.md) を参照。

### 実装方法

- **Guard**: `@Roles()` デコレータ + `RolesGuard` で Controller レベルで制御
- **テスト**: E2E テストで権限のないロールのアクセスが 403 になることを検証済み

---

## 実施済みセキュリティ対策

### 入力バリデーション

| 層             | 方法                                                           |
| -------------- | -------------------------------------------------------------- |
| フロントエンド | Zod スキーマによるフォームバリデーション                       |
| バックエンド   | class-validator + class-transformer による DTO バリデーション  |
| データベース   | Prisma スキーマの型制約 + PostgreSQL の NOT NULL / UNIQUE 制約 |

3層でバリデーションすることで、いずれかの層を迂回されても安全です。

### SQL インジェクション防御

Prisma ORM を使用。すべてのクエリがパラメータ化されており、SQL インジェクションは構造的に防止されています。生 SQL（`$queryRaw`）を使用する箇所では、テンプレートリテラルによるパラメータバインドを使用しています。

### XSS 防御

- **React の自動エスケープ**: JSX 内の変数は自動的にエスケープされる
- **dangerouslySetInnerHTML 不使用**: 生 HTML の挿入はなし
- **Caddy のセキュリティヘッダー**: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`

### CORS 設定

```typescript
// main.ts
app.enableCors({
  origin: [環境変数 CORS_ORIGIN から取得],
  credentials: true,  // Cookie 送信を許可
});
```

本番では `https://<DOMAIN>` のみ許可。複数オリジンに対応済み。

### セキュリティヘッダー（Caddy）

Caddy のリバースプロキシが以下のヘッダーを自動付与:

- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`

### データ保護

- **監査ログ**: 全テーブルの CUD 操作を自動記録。誰が・いつ・何を・どう変えたかを追跡可能
- **悲観的ロック**: 在庫データの上書き操作に `SELECT ... FOR UPDATE` を使用し、同時更新の競合を防止
- **物理削除 + 監査ログ**: レコードは物理削除するが、削除前の状態が監査ログに保存される

---

## セキュリティ監査の記録

### 2026年3月 実施

監査範囲: バックエンド全体（認証・認可・入力処理・API エンドポイント・データベース操作）

#### CRITICAL（4件 → 修正済み）

| #   | 問題                                    | 対策                                           |
| --- | --------------------------------------- | ---------------------------------------------- |
| 1   | JWT を `decode`（署名未検証）で処理     | `verify`（署名検証あり）に変更                 |
| 2   | JWT に `jti`（トークンID）が任意        | `jti` を必須化し、ログアウト時の無効化を確実に |
| 3   | Docker Compose の環境変数がハードコード | 環境変数ファイル（`.env.production`）に外出し  |
| 4   | `JWT_SECRET` がデフォルト値で起動可能   | 未設定時は起動エラーにする                     |

#### HIGH（7件 → 修正済み）

| #   | 問題                                | 対策                               |
| --- | ----------------------------------- | ---------------------------------- |
| 1   | Orders の作成に認可ガードなし       | ADMIN ロール必須に変更             |
| 2   | Stocktakings の更新に認可ガードなし | ADMIN ロール必須に変更             |
| 3   | Stocks エクスポートに認可ガードなし | ADMIN ロール必須に変更             |
| 4   | CORS が単一オリジンのみ対応         | 複数オリジン対応に拡張             |
| 5   | 在庫上書きに排他制御なし            | 悲観的ロック（`FOR UPDATE`）を追加 |

> 注: 監査時点（2026 年 3 月）は username/password ログインを前提に HIGH #6（パスワード変更のレート制限）と #7（bcrypt ラウンド）が計上されていました。SSO 一本化後の reference はパスワードを保持しないため、この 2 項目は rete 側の IdP 責務へ移管されています（rete は Argon2id を採用・rete の IdP 監査ポリシーに従う）。

**修正後のステータス**: CRITICAL 0件、HIGH 0件（SSO 移行時点）

---

## シークレット管理

### リポジトリに含めないもの

- `.env`、`.env.production`、`.env.local` — gitignore 対象
- SSH 鍵、AWS 認証情報
- 本番 DB のパスワード、JWT_SECRET

### 環境変数テンプレート

| ファイル                               | 用途                     |
| -------------------------------------- | ------------------------ |
| `packages/backend/.env.example`        | 開発環境のバックエンド   |
| `packages/frontend/.env.local.example` | 開発環境のフロントエンド |
| `.env.production.example`              | 本番環境                 |

テンプレートにはダミー値のみ記載。本番の値は各環境で設定。

---

## 顧客が確認すべきこと

引き渡し後の運用タスクを時間軸で整理しています。チェックリストとして活用してください。

### 初回セットアップ（引き渡し当日）

- [ ] `.env.production` のシークレットを独自の値で生成する（`JWT_SECRET` は 64 文字以上推奨）
- [ ] `JWT_SECRET` が未設定の場合は起動エラーになることを確認する
- [ ] CORS の `origin` を自社ドメインに変更する
- [ ] `OIDC_CLIENT_SECRET` を rete 側と一致する独自値で生成し、`OIDC_REFERENCE_REDIRECT_URIS` に本番 callback URL を登録する
- [ ] OIDC で JIT プロビジョニングされた初回ユーザーへ SYS_ADMIN ロールを付与する（`PATCH /api/v1/users/:id` で実施。初回は SYS_ADMIN が不在のためデータベースで直接付与）

### 本番デプロイ前チェック（ステージング環境で実施）

- [ ] `NODE_ENV=production` で Swagger が非公開になっていることを確認する
- [ ] 例外発生時のレスポンスにスタックトレース・SQL・ファイルパスが含まれていないことを確認する
- [ ] `pnpm audit` を実行し、CRITICAL / HIGH の脆弱性がないことを確認する
- [ ] E2E テスト（権限のないロールで 403 になること、OIDC callback の state/nonce/PKCE 検証、pending→role 付与後の `/home` 遷移）が全件パスすることを確認する
- [ ] CORS が本番ドメインのみに限定されていることを確認する

### 月次

- [ ] `pnpm audit` で脆弱性をチェックし、必要に応じて依存関係を更新する
- [ ] 監査ログ（`audit_logs` テーブル）の異常操作を確認する
- [ ] `pnpm outdated` でメジャーバージョン遅延を把握する

### 四半期

- [ ] `JWT_SECRET` をローテーションする（全セッション強制ログアウトになる点に留意）
- [ ] 不要になったサービスアカウント・ユーザーアカウントを棚卸しして削除する
- [ ] `OIDC_CLIENT_SECRET` を rete と協調してローテーションする

### 年次

- [ ] reference のユーザー棚卸し（`is_active` フラグ・role の妥当性）を実施する
- [ ] SSL 証明書・ドメイン設定を含むインフラ全体のセキュリティ監査を実施する
- [ ] rete 側の IdP 監査（パスワードハッシュ Argon2id・rate limit）も併せて確認する（rete 側の年次 IdP 監査ポリシーに従う）

---

## 関連ドキュメント

| ドキュメント                                            | 内容                                                |
| ------------------------------------------------------- | --------------------------------------------------- |
| [USER_ROLES.md](../02-architecture/USER_ROLES.md)       | 5ロール体系・CRUD 権限マトリクス                    |
| [ARCHITECTURE.md](../02-architecture/ARCHITECTURE.md)   | OIDC フロー / cookie 設計 / `jwt.strategy` の全体像 |
| [API_REFERENCE.md](../02-architecture/API_REFERENCE.md) | `/auth/oidc/*` エンドポイント仕様                   |
