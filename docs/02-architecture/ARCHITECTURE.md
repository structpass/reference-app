# アーキテクチャ設計書

## システム全体構成

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend       │     │   Database      │
│   Next.js 15    │────▶│   NestJS        │────▶│   PostgreSQL 16 │
│   Port: 3000    │     │   Port: 3001    │     │   Port: 5432    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                        ┌─────┴─────┐
                        │  Prisma   │
                        │  ORM      │
                        └───────────┘
```

## モノレポ構成

pnpm workspace によるモノレポ構成を採用し、フロントエンド・バックエンド・共有パッケージを一元管理します。

```
struct-pass-reference/
├── packages/
│   ├── frontend/     # @struct-pass/frontend - Next.js 15 (App Router)
│   ├── backend/      # @struct-pass/backend  - NestJS
│   └── shared/       # @struct-pass/shared   - 共有型定義
├── docs/             # ドキュメント
└── docker-compose.yml
```

> **shared パッケージの利用状況**: `@struct-pass/shared` は主に frontend が利用する共通型置き場です。backend は Prisma 生成型（`@prisma/client`）と各モジュール内 DTO で型を完結させていますが、`TABLE_IDS` など SSOT として参照される定数については backend からも import しています（型としては `FeatureId` 等も shared から import）。

## 技術選定理由

### フロントエンド: Next.js 15 (App Router)

- **Server Components**: パフォーマンス最適化
- **App Router**: ファイルベースルーティング、レイアウト、ローディング UI
- **React 19**: 最新の React 機能（Suspense、Transitions）
- **Tailwind CSS**: ユーティリティファーストでデザインシステムと相性が良い

### バックエンド: NestJS 10

- **DI コンテナ**: テスタビリティと保守性
- **デコレータベース**: 宣言的な API 定義（Guards, Interceptors, Pipes）
- **Passport 統合**: JWT 認証の標準パターン
- **エンタープライズ向け**: 大規模アプリケーションに適したアーキテクチャ

### データベース: PostgreSQL 16 + Prisma

- **PostgreSQL**: ACID 準拠、JSON サポート、拡張性
- **Prisma ORM**: 型安全なクエリビルダー、マイグレーション管理、スキーマファースト

## バックエンド アーキテクチャ

### レイヤー構成

```
Controller → Service → Repository → Prisma
     ↓           ↓
  Guards      Interceptors
  (認証/認可)   (監査ログ)
```

- **Controller**: HTTP 境界。リクエスト受領・DTO バリデーション・レスポンス整形のみ
- **Service**: 業務ロジックを担当する。ORM Clientを直接利用せずRepositoryを経由し、EntityからResponse DTOへのmapperを呼び出す
- **Repository**: データアクセス層（`modules/*/repositories/*.repository.ts`）。Prismaへのクエリとtransactionを担当する

詳細な境界は [ARCHITECTURE_INVARIANTS.md](./ARCHITECTURE_INVARIANTS.md) を正本とする。

### モジュール構成

| モジュール                                                                                        | 責務                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `DatabaseModule`                                                                                  | Prisma 接続管理（@Global）                                                              |
| `AuthModule`                                                                                      | OIDC SSO 認証（rete IdP 連携）、JWT 発行、ログイン/ログアウト                           |
| `UsersModule` / `GroupsModule` / `PermissionsModule`                                              | ユーザー / グループ / 権限マトリクス                                                    |
| `ProductsModule` / `CategoriesModule` / `WarehousesModule` / `CarriersModule` / `SuppliersModule` | マスタ系 CRUD（Excel エクスポート対応）                                                 |
| `ImportsModule`                                                                                   | CSV ファイル取込（products 対応、将来は他マスタも拡張可能）                             |
| `ReceivingsModule` / `ShipmentsModule` / `ShippingModule`                                         | 入荷 / 出荷 / 入出荷統合一覧                                                            |
| `StocksModule` / `StocktakingsModule`                                                             | 在庫 / 棚卸                                                                             |
| `OrdersModule`                                                                                    | 発注（伝票・明細）                                                                      |
| `DashboardModule`                                                                                 | ダッシュボード（GET /dashboard/counts — 権限フィルタ済みカウンタ）                      |
| `ObjectTypesModule`                                                                               | カスタムオブジェクト定義基盤（台帳・レコードの API と画面）                             |
| `AnnouncementsModule`                                                                             | 掲示板 API（管理 / 閲覧 / 添付ファイル / ロール公開。画面は rete の Home 掲示板へ集約） |
| `SystemSettingsModule`                                                                            | システム設定（公開キー / 非公開キー / UI テーマ等）                                     |
| `AuditModule`                                                                                     | 監査ログ記録                                                                            |
| `UserTableColumnWidthsModule` / `ListPaginationSettingsModule`                                    | 個人設定（テーブル列幅 / 一覧表示件数）の永続化                                         |

`src/modules/` 配下の機能モジュールは全 23 件（2026-07-23 時点）。`DatabaseModule` は `src/database` の @Global 基盤モジュール。

### 横断的関心事

- **AllExceptionsFilter**: 統一エラーレスポンス形式
- **AuditInterceptor**: CUD 操作の自動ログ記録
- **JwtAuthGuard**: JWT 検証（Cookie 優先 / Bearer fallback、global APP_GUARD）
- **RequireRoleGuard**: `@RequireRole(...roles)` を付けた endpoint でフィーチャーレベルのロール要求を hard-coded 判定（bootstrap 系 controller の固定権限）
- **PermissionGuard**: `@RequirePermission(featureId, action)` を付けた endpoint で DB 権限マトリクスを照合し 200 / 403 を切り分け

## セキュリティ設計

- OIDC SSO による認証（rete IdP 連携）。reference 自前の JWT を HttpOnly Cookie で発行（`Authorization: Bearer` は Swagger・curl 用の fallback）
- パスワードは reference では保持しない（認証情報の SoT は rete / IdP 側）
- ロールベースアクセス制御（5 ロール体系: SYS_ADMIN / WH_ADMIN / WH_USER / OF_ADMIN / OF_USER）
- 入力バリデーション（class-validator）
- 監査ログによる操作追跡

## データフロー

### 認証フロー

OIDC Authorization Code Flow（PKCE / state / nonce）で rete を IdP として SSO する。identity の SoT は rete 側で、reference はパスワードを保持しない。

```
1. GET /api/v1/auth/oidc/login  ※ @Public()
   → PKCE/state/nonce を発行 → 署名 cookie に退避 → rete /authorize へ 302
2. ユーザーが rete でログイン → reference の callback へ code を付けて redirect
3. GET /api/v1/auth/oidc/callback  ※ @Public()
   → state cookie 検証 → code を token に交換（OidcService.handleCallback）
4. UsersService.provisionFromOidc(claims)：oidc_sub でリンク（JIT プロビジョニング）
   ・既存ユーザーは表示名/メールを更新、未登録は role=null（権限待ち）で作成
5. AuthService.issueJwt(user) → reference 自前 JWT を HttpOnly Cookie で発行
6. role 割当済み → frontend /dashboard、role=null（pending）→ /pending へ redirect
7. 以降のリクエストは Cookie（優先）または Authorization: Bearer（fallback）で JWT を送信
```

### 商品 CRUD フロー

```
1. Request（Cookie 優先 / Bearer fallback で JWT 付与）
2. JwtAuthGuard → JWT 検証
3. AuditInterceptor → 操作前の状態を記録
4. Controller → Service → Repository → Prisma
5. AuditInterceptor → 操作後の状態を記録、AuditLog 作成
6. Response
```
