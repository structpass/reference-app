# struct-pass-reference 運用ポリシー

このファイルは struct-pass-reference の運用観点におけるプロジェクト前提を集約する。機能追加時に「ログはどう出すべきか」「失敗時にどう振る舞うか」を毎回判断するのではなく、ここに書かれた方針に従う。譲渡先の開発者も本ファイルを参照することを想定する。

関連: 構造的不変条件は [`docs/02-architecture/ARCHITECTURE_INVARIANTS.md`](../02-architecture/ARCHITECTURE_INVARIANTS.md) に集約し、本ファイルはその運用層の兄弟ポリシーとする。

外部依存、環境変数、認証、エラー、ログ、healthcheck、データ保持、通知へ影響する変更では、実装前に本ファイルの該当節を確認する。発火条件はリポジトリの`AGENTS.md`を正本とする。

---

## §1 エラーハンドリング一元化方針

構造的不変条件の「Error handling」に従い、モジュール内へ汎用try/catchを散らさず、上位filterで共通処理する。

### Filter 構成

- **全例外**: `AllExceptionsFilter` (`packages/backend/src/common/filters/http-exception.filter.ts`)
- **Prisma 固有**: `PrismaExceptionFilter` — P2002 (conflict) / P2003 (foreign key) / P2025 (not_found)

### 応答 shape（HTTP エラー時）

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "validationErrors": ["..."] }
  }
}
```

### error code 体系

| code                | HTTP status | 用途                                         |
| ------------------- | ----------- | -------------------------------------------- |
| `VALIDATION_ERROR`  | 400         | 入力 validation 失敗（class-validator 由来） |
| `BAD_REQUEST`       | 400         | その他の不正リクエスト                       |
| `UNAUTHORIZED`      | 401         | 未認証                                       |
| `FORBIDDEN`         | 403         | 権限なし                                     |
| `NOT_FOUND`         | 404         | リソース不存在（Prisma P2025 含む）          |
| `CONFLICT`          | 409         | 一意制約違反（Prisma P2002 含む）            |
| `TOO_MANY_REQUESTS` | 429         | レート制限超過（`@nestjs/throttler` 由来）   |
| `INTERNAL_ERROR`    | 500         | 未処理例外                                   |

### 規約

- 新規 catch ブロックを書く前に、上記 filter で済まないか確認すること
- 新規 error code を追加する場合は本表に追記し、対応 filter を更新する
- HTTP コンテキスト外（非同期 job、event handler）からは filter に乗らないため、個別に try/catch + `logger.error` で痕跡を残す（例: `audit.service.ts`）

---

## §2 ログ方針

### 採用

- **NestJS 標準 `Logger`** — pino/winston は不採用
- context prefix で発生元識別: `new Logger(ClassName.name)` パターン
- 出力先: **stdout**（譲渡先で log shipper を被せる前提）
- **structured JSON 化は将来検討、現状は不採用**（譲渡先で必要時に切替）

### log level 規約

| level   | 用途                                       |
| ------- | ------------------------------------------ |
| `error` | 未処理例外、外部依存失敗、業務不変条件違反 |
| `warn`  | リトライ可能な失敗、設定不整合             |
| `log`   | 起動/停止、認証成功、主要ライフサイクル    |
| `debug` | 開発時のみ、本番無効                       |

### 規約

- console.log は使わない（context prefix が失われるため）
- センシティブ情報（JWT secret、password、個人情報）は log に出さない
- 例外の stack trace は `error` level でのみ出力

---

## §3 依存障害時の挙動分類

業務処理の重み付けで「止める/止めない」を明確化する。2026-05-11 quick scout 時点の分類:

### 止める側（必須経路、失敗時は業務エラー）

- **DB (PostgreSQL)** — Prisma 経由
- **JWT 認証 / 認可ガード**
- **ローカルファイル書き込み** (`AnnouncementStorageService` — attachment 保存)
- **rete (OIDC IdP)** — SSO 認証フロー（authorization code 交換 / JWKS 取得）。reference は rete とセット売りの RP（`docs/decisions/0006`）のため「止める側」。rete 停止時は SSO ログイン不可（callback は `/login?error=sso` に degrade、発行済み JWT cookie の既存セッションは満了まで有効）。

### 止めない側（fire-and-forget、失敗時は logger.error で痕跡のみ）

- **監査ログ** (`audit.service.ts` の既存判断 — 業務処理を阻害しない)
  - **理由**: 監査ログ DB 書き込みエラーで業務トランザクションを ロールバックさせると、副作用が大きすぎる

### 規約

- 新規外部依存（SMTP / S3 / 外部 API / Queue / Cache 等）を追加する時は、止める/止めない を /plan 段階で宣言すること
- 「止めない側」に追加する場合、`audit.service.ts` と同じパターン（try/catch + logger.error）を採用、catch を握り潰さない

### ファイルアップロード（CSV 取込 — imports モジュール）の現状実装

2026-05-29 時点で実装済の `imports` モジュール（`packages/backend/src/modules/imports/`）の運用上の事実を記録する。新方針の発明ではなく、現状実装の文書化。

- **一時ファイル保持なし（メモリ buffer 処理）**: `FileInterceptor`（`@nestjs/platform-express`）の既定 memory storage を使い、アップロードは `file.buffer` としてメモリ上で処理する。ディスクへの一時ファイル書き込みは行わない（`AnnouncementStorageService` のローカル FS 書き込みとは別系統で、CSV 取込は永続化しない）。
- **サイズ上限**: `MAX_IMPORT_BYTES = 10 MB`（`imports.constants.ts`）。multer の `limits.fileSize` で hard limit を掛け、`files: 1` で複数ファイルを拒否。announcements の `MAX_UPLOAD_BYTES` パターンに倣い env var にはしない。
- **行数上限**: `MAX_IMPORT_ROWS = 10000`（ヘッダー行除く）。同じく env var 化しない固定値。
- **all-or-nothing 取込**: commitはRepositoryが所有する`$transaction`（例: `products.repository.ts`の`bulkUpsertByCode`）で実行し、1行でも失敗すればtransaction全体をrollbackする。ServiceとImporterはORMを直接利用しない。`dryRun=true`の検証専用モードも提供する。
- **超過・不正時の応答**: 行数超過・ヘッダー不一致・空ファイル・行レベル検証失敗は例外を散らさず値（`ImportOutcome`）として収集し、controller 境界で 1 度だけ `BadRequestException` を throw → `AllExceptionsFilter` が `VALIDATION_ERROR`（400、§1 の error code 体系）として整形する。サイズ超過は multer が境界で reject、MIME 不一致は `fileFilter` が `BadRequestException` を返す。
- **バイナリ偽装対策（SEC-H1）**: MIME 申告値は偽装可能なため、`imports.service.ts` が buffer 先頭の NUL バイト走査（先頭 8 KB）+ 既知バイナリ署名のマジックバイト判定で非テキストを弾く defense-in-depth。
- **CSV formula injection 対策（SEC-H2）**: テンプレート / エラー CSV 生成時、先頭が数式トリガ文字（`= + - @` 等）のフィールドに `'` を前置する（`csv.service.ts`）。

### 将来の伏線（2026-05-11 scout 時点）

- **announcement attachment の S3 化**: 現状ローカル FS。譲渡先要件で S3 等に切替される可能性。その時点で「ネットワーク I/O 故障時の retry/timeout 戦略」を本セクションで再分類する必要あり
- **system-settings cache の Redis 化**: `system-settings.service.ts` に「水平スケール時は Redis に置き換え」とコメントあり。Redis 導入時、cache miss → DB fallback パターンを本セクションで明文化する必要あり

---

## §4 環境変数バリデーション規約

`main.ts` の `validateEnv()` パターンを規約として明文化する。

### 起動時バリデーション

- `REQUIRED_ENV_VARS` 配列で必須 var を宣言
- 起動時に missing をチェック、欠落時は throw（プロセスを上げない）
- placeholder 値（例: `your-secret-key-change-in-production`）の検出
- 本番制約（`NODE_ENV=production` 時の追加バリデーション、例: `JWT_SECRET ≥ 32 chars`）

### 新規 env var 追加時の手順

1. `.env.example` に**コメント付き**で追加（必須/任意、推奨値、生成方法）
2. `REQUIRED_ENV_VARS` に追加（必須の場合）
3. 起動時バリデーションを書く（フォーマット要件があれば、本番制約も含めて）
4. 譲渡時に値の差し替えが必要な場合は `.env.example` のコメントで明示

### 規約

- secret 系 env var は `.env.example` に placeholder のみ記載、実値はコミットしない
- env var 名は SCREAMING_SNAKE_CASE
- グルーピングは `.env.example` のコメント区切りで表現（DATABASE / JWT / Application / CORS 等）

### DATABASE_URL 接続プール上限（2026-08-11 追加・ref-0071）

| env            | 必須 | 説明                                                                                                                                       |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL` | ✅   | PostgreSQL 接続。**接続プール上限を URL のクエリで明示する**（`connection_limit=5` / `pool_timeout=70`・既定値をライブラリ任せにしない）。 |

- **妥当域**: `connection_limit` 1〜20 / `pool_timeout` 65〜120 秒。未指定・整数以外・想定域外なら起動時に警告し、本番は起動拒否（`common/config/env-validation.ts` の `validateDatabasePoolLimits`）。上限が無いと interactive tx（商品一括取込ほか）の同時実行が DB の `max_connections` を食い潰し、OIDC callback のユーザー取得まで巻き込む＝ログイン不能になる。
- **`pool_timeout` の決め方**: 通常クエリのプール待ち上限で、超過は P2024 → 503 + `Retry-After`（`PrismaExceptionFilter`・0＝無限待ちは拒否）。最長の tx 上限（商品一括取込の 60 秒・`products.repository.ts`）より長く取る＝短いと取込を握っている側より先に無関係なリクエストが 503 になる（下限 65 の根拠。写し元 rete は最長 tx 15 秒前提の下限 15）。この保証が効くのは飽和時（同時取込などで占有接続が `connection_limit` 本に達した時）で、その間の通常リクエストは 503 になるまで最大 `pool_timeout` 秒待つ（プール待ちは FIFO のため飢餓は起きない）。**interactive transaction の接続待ちは `pool_timeout` ではなく `maxWait`**（一括取込は 10 秒）が先に切り、その時のコードは P2028（写像先は同じ 503）。
- **本番の反映順**: 本検査は起動時に走るので、`connection_limit` / `pool_timeout` を含まない `DATABASE_URL` のままデプロイすると起動しない＝compose / env の更新を先に済ませてからアプリを入れ替える（`docker-compose.yml` / `docker-compose.prod.yml` は指定済み）。
- **接続数の勘定**: reference はログイン状態を JWT cookie で持ち DB の session ストアを使わないため、1 インスタンスの実消費は本体の `connection_limit=5` のみ。インスタンスを増やす時は インスタンス数 × `connection_limit` が `max_connections` を超えないか見直す。
- **検査の適用範囲**: アプリ本体の起動時（`main.ts`・本番は fail-fast / dev は警告）と seed（`prisma/seed.ts`・警告のみ・完走を止めない。未使用判定済みの `seed-announcements-only.ts` は対象外）。migrate（`prisma migrate`）は CLI の別プロセスで検査の hook 点が無いため**適用範囲外**。

### OIDC / SSO env（2026-05-30 追加）

reference は rete(IdP) とセットで動く OIDC RP。以下を `REQUIRED_ENV_VARS` で必須化し起動時に検証する。

| env                  | 役割                      | 備考                                                                                       |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `OIDC_ISSUER`        | rete IdP の issuer URL    | SSO 共存時は rete backend のポートを分ける（例: 3011）                                     |
| `OIDC_CLIENT_ID`     | rete に登録した client_id | rete 側 `OIDC_REFERENCE_CLIENT_ID` と一致                                                  |
| `OIDC_CLIENT_SECRET` | RP の client_secret       | rete 側 `OIDC_REFERENCE_CLIENT_SECRET` と同一。`CHANGE_ME_` placeholder のままだと起動拒否 |
| `OIDC_REDIRECT_URI`  | callback URL              | rete 側 redirect_uris に同値を登録                                                         |

- **cookie 署名鍵**: OIDC state cookie（`sp_oidc_state`）の署名は `JWT_SECRET` を流用し env を増やさない（`main.ts` の `cookieParser`）。
- **`BOOTSTRAP_ADMIN_SUB`**（ref-0086 で用途拡張）: 初期管理者の sub（= rete `Account.id` = reference `User.oidcSub`）。**bootstrap（`prisma/bootstrap-admin.mjs`）用**で `REQUIRED_ENV_VARS` には含めない（server 起動には不要）。dev は固定 UUID 既定、譲渡・本番では両 repo を同一の新規 UUID に差し替える。本番の初期管理者は `prisma/bootstrap-admin.mjs`（SYS_ADMIN 1 名のみ・冪等・両順序対応）で作る。bootstrap は毎デプロイで SYS_ADMIN・有効を再付与するため、**初期管理者を交代・無効化する時は `.env.production` から `BOOTSTRAP_ADMIN_SUB` を除去する**（残したままだと UI で降格・無効化しても次のデプロイで復活する）。`prisma/seed.ts` は dev/demo 専用で `NODE_ENV=production` の時は無条件拒否する（ref-0086）。
- **`BOOTSTRAP_ADMIN_EMAIL`**（ref-0086 新規）: bootstrap の初期管理者 email。`BOOTSTRAP_ADMIN_SUB` 指定時は必須（未設定なら bootstrap が明示エラーで終了）。既存ユーザーの email/name は上書きしない（SSO claim 由来の値を汚さない）。
- **`BOOTSTRAP_ADMIN_NAME`**（ref-0086 新規）: bootstrap の初期管理者表示名。省略時は email を流用。

### サービス連携 env（2026-08-22 追加・ref-0095）

| env                         | 役割                                          | 備考                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTEGRATION_SERVICE_TOKEN` | 機械認証の共有 credential（rete → reference） | secret 扱い。本番は 32 文字以上。未設定時は受口が fail-closed で常に拒否（連携だけ無効化）。`REQUIRED_ENV_VARS` には含めない（未設定でも起動は許す・受口側で無効化）。placeholder（`CHANGE_ME_`）のままは起動拒否。生成: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`。token はログ・エラー応答・クライアント応答へ出さない。 |

**credential ローテーション手順（ref-0095）**: ① 新しい値を `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` で生成 → ② reference 側の `INTEGRATION_SERVICE_TOKEN` を差し替えて再起動 → ③ rete 側（hom-0067）の同 env も差し替え（rete と reference は同一値を使う・片方だけ差し替えると連携が 401 で止まる）→ ④ 稼働確認（rete から ObjectType 一覧が取得できること）。短いダウンタイムを許容する場合は、両方同時に差し替える。連続稼働が必須の場合は値の二重化（旧/新の一時併存）を検討するが、本システムは単一 composite 前提のため同時差し替えで足りる。

### リバースプロキシ / レート制限 env（2026-08-02 追加）

| env           | 役割                                                        | 備考                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY` | `true` 時のみ trust proxy hops=1 を有効化（任意・既定 off） | 本番 compose（Caddy 配下）は `"true"` 固定。直結起動では未設定のまま（偽 XFF で制限回避防止）。値は `true` 固定・CIDR 等の自由値は受け付けない。`REQUIRED_ENV_VARS` には含めない。**構成変更時の制約**: Caddyfile に `trusted_proxies` を追加する時は、backend 側の trust proxy 設定（hops 数）も併せて調整必須（client 由来 XFF チェーンが温存され、hops=1 が攻撃者制御値を見るようになる） |

---

## §5 healthcheck 方針

### 現状

- **未実装**

### 方針（2026-05-11 確定、実装は統合 backlog 経由）

譲渡前提のリファレンス実装として、最低限の healthcheck を入れる方向で確定。実装は単独で着手せず、他の運用実装が積み上がった時点で統合 /plan を立てて一括対応する。

### スコープ（確定: B = liveness + DB readiness 同居）

- endpoint: `/api/v1/health`
- 認証: 不要
- 応答: `{ status: 'ok', db: 'ok', timestamp: '...' }`
- DB 接続のみ確認、業務 logic は通さない、外部依存は含めない
- 採用ライブラリ: `@nestjs/terminus`

### k8s 配備時の拡張

- `/health/live`（liveness のみ）と `/health/ready`（readiness）の分離が必要になった場合、本 endpoint を残しつつ別 endpoint を追加する形で対応
- 譲渡先判断、リファレンス側は B スコープのまま維持

---

## §6 データ保持期限・個人情報境界

### 現状

- **未定義**

将来 fill される場所として明示的に空欄を残す。実際に削除/保持要件が要件として出てきた時に書く（推測で埋めない）。

### 触る時の参照先候補

- 監査ログの保持期限（GDPR 等の枠組み）
- ユーザー削除時の personal data の扱い（soft delete vs hard delete）
- attachment（announcement の添付ファイル）の削除ポリシー
- 法的・契約的要求（譲渡先によって異なる）

### 追記する時の条件

- 実際に削除/保持要件が要件として出てきた時
- 譲渡先の運用要件・法規制が確定した時
- それまで推測で書かない

---

## §7 通知ルート（インシデント検知）

### 現状

- **持たない方針（2026-05-11 確定）**

### 理由

- 通知方式は譲渡先の運用形態に強依存（Datadog / Sentry / Slack / メール / PagerDuty 等）
- リファレンス側にベース実装を持つと「どの方式に寄せたか」が偏りとして残り、押し付けになるリスクが高い
- Company は個人運用で「気付かなくてよい」が許容される

### 譲渡先導入時の検討ポイントメモ

- error log の集約先（Datadog / CloudWatch / Sentry / etc.）
- alert threshold（5xx 率、レスポンスタイム、依存障害）
- notification channel（Slack / メール / PagerDuty / **Rete Chat（将来候補）**）

### Rete 連携メモ

Rete 構想（`memory/structpass/vision_rete.md`）が進行し Comm/Chat アドオンが成立した場合、struct-pass-reference 等の各プロダクトから Rete Chat に通知を流す連携が将来候補として浮上する。現時点では未着手、Rete 側の構造が見えた段階で再検討する。

---

## §8 SSO 移行と本番ハードニング backlog（2026-05-30）

Step4（OIDC SSO 一本化）で確定した移行制約と、MVP では不発火だが本番稼働前に対応する hardening を記録する。設計判断の根拠は rete リポの `docs/decisions/0005`〜`0012`。

### 移行制約（User schema）

`20260530190115_oidc_sso_integration` は `username` / `password_hash` / `must_change_password` を撤去し `name`（NOT NULL）/ `oidc_sub`（@unique）を追加、`role` を nullable 化する。**新規（空）の users テーブル前提**で、既存行のある DB へそのまま適用すると `name NOT NULL` 追加が失敗する。identity モデル切替のため実ユーザーは SSO 初回ログインで JIT 再プロビジョニング（`oidc_sub` リンク）される前提。populated-DB の in-place upgrade が必要になった場合は backfill 手順（`name` 暫定値 + `oidc_sub` 再リンク）を別途用意する。

### 本番ハードニング backlog（Step6・本番稼働前）

現状 MVP（rete とセット売り・本番未稼働）では不発火。本番運用に乗せる前に対応する:

- **cookie Secure 属性**: `AUTH_COOKIE` / `sp_oidc_state` の `secure` が `NODE_ENV=production` 依存。staging を `NODE_ENV=development` のまま HTTPS 運用すると Secure が落ちる。`COOKIE_SECURE` env 分離 or deploy で `NODE_ENV=production` 徹底。
- **JWT Bearer フォールバック**: `jwt.strategy.ts` が cookie 不在時に `Authorization: Bearer` を受理（Swagger/curl 用）。本番は cookie のみに絞る。
- ~~**redirect base の env 分離**~~: 解消済み（rete-auth-0007・2026-07-10）。OIDC callback 後の redirect 先を `OIDC_FRONTEND_URL` 専用 env へ分離し、production は未設定時に起動を拒否（fail-closed）。dev は後方互換で `CORS_ORIGIN` 先頭値へ fallback（`oidc.controller.ts` `frontendBase()` / `main.ts` `validateEnv()`）。
- **rete IdP 側**: `OIDC_JWKS` の `JSON.parse` を fail-fast 化 / interaction details（`GET :uid`）にレート制限 / `OIDC_COOKIE_KEYS` の placeholder 検出を `NODE_ENV` 未設定時も有効化。
- **rete seed のデモ既定パスワード**: ソース既定値を共有・staging 環境では env 必須化する。

---

## 改訂履歴

| 日付       | 内容                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-11 | 初版（`/discover` セッションで 7 sections を確定）。設計 spec は社内管理リポジトリで管理し、本リファレンスには同梱しない。                                                                                                                                                                                                                                                              |
| 2026-05-29 | §3 にファイルアップロード（CSV 取込 — imports モジュール）の現状実装を追記（メモリ buffer 処理 / サイズ・行数上限 / all-or-nothing transaction / 超過時応答 / SEC-H1・SEC-H2）。現状実装の文書化のみで新方針の発明はなし。                                                                                                                                                              |
| 2026-05-30 | OIDC SSO 統合（Step4）を反映。§3 に rete(IdP) を「止める側」依存として追加 / §4 に OIDC env グループ + `BOOTSTRAP_ADMIN_SUB`（seed 専用）を明記 / §8 を新設（User schema 移行制約 + 本番ハードニング backlog）。併せて `main.ts` の placeholder 検出を `CHANGE_ME_` 接頭辞汎用化（JWT_SECRET の旧 placeholder 取りこぼし修正 + OIDC_CLIENT_SECRET 追加）、seed に本番拒否ガードを追加。 |
