# Struct Pass Reference

商品・倉庫・受発注・在庫を扱う参照実装です。Next.js / NestJS / PostgreSQL / Prismaを使い、ログインは別アプリの[Rete](https://github.com/structpass/rete-public)が担います。両リポジトリをセットでローカル評価してください。

利用条件は[LICENSE.md](./LICENSE.md)と[NOTICE.md](./NOTICE.md)が正本です。PolyForm Free Trial License 1.0.0による評価目的のsource-available提供で、一般的なOSSライセンスではありません。

## 先に準備するもの

- Node.js 24.14.1（版の正本は`.nvmrc`。`package.json`のenginesは`>=24.0.0`）
- pnpm 9.15.4、Docker Compose、依存・フォント取得のネットワーク接続
- [Reteの起動手順](https://github.com/structpass/rete-public#評価環境の起動)を完了した評価環境

共存時はReteをfrontend **3010** / backend **3011** / DB **5433**、Referenceをfrontend **3000** / backend **3001** / DB **5432**にします。

Reteのルート.envはRETE_DB_PORT=5433、backend .envはPORT=3011・CORS_ORIGIN=http://localhost:3010・DATABASE_URLのポート5433、frontend .env.localはPORT=3010・NEXT_PUBLIC_API_BASE_URL=http://localhost:3011/api/v1に設定します。Reference frontendではNEXT_PUBLIC_API_URL=http://localhost:3001/api/v1です。両アプリでAPI変数名が異なります。Reteのbackend設定は、frontendとOIDCのログイン画面の移動先にも使われます。

## Referenceを準備する

```bash
git clone https://github.com/structpass/reference-app.git
cd reference-app
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.local.example packages/frontend/.env.local
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm --filter @struct-pass/shared build
pnpm --filter @struct-pass/backend prisma:generate
```

Windows PowerShellではcpをCopy-Itemに置き換えられます。既存envは上書きしません。Referenceではルートの.env.production.exampleをローカル.envへコピーしません。本番の配布手順は本公開版の対象外です。

ルートの`.env`は開発用composeが読むファイルで、`POSTGRES_PASSWORD`と`JWT_SECRET`を必須とします（既定値を持たず、未設定ならcomposeが起動前に停止します）。`.env.example`のまま使う場合はパスワードを自分の値へ変えてください。開発DBはホストの`127.0.0.1`にのみ公開されます。

backendのDATABASE_URLはローカル評価DBに設定してください。composeの既定DBを使う場合、値は`postgresql://postgres:<ルート.envのPOSTGRES_PASSWORD>@127.0.0.1:5432/struct_pass_dev?schema=public&connection_limit=5&pool_timeout=70`です。`127.0.0.1`を使い、`localhost`は避けてください（このリポジトリの評価手順はIPv4のloopbackを前提にしています）。NODE_ENV=developmentを使います。

## 両アプリの認証を接続する

共通secretは自分の評価環境で生成し、同じ値を両側に設定します。値をソースやIssueへ掲載しないでください。

```bash
node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"
```

| 関心事             | Rete backend .env                                                                                 | Reference backend .env                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| issuer             | OIDC_ISSUER=http://localhost:3011/api/v1/oidc                                                     | 同じOIDC_ISSUER                                                            |
| client ID          | OIDC_REFERENCE_CLIENT_ID=struct-pass-reference                                                    | OIDC_CLIENT_ID=struct-pass-reference                                       |
| client secret      | OIDC_REFERENCE_CLIENT_SECRETに生成した値                                                          | 同じ値をOIDC_CLIENT_SECRETへ                                               |
| callback           | OIDC_REFERENCE_REDIRECT_URIS=http://localhost:3001/api/v1/auth/oidc/callback                      | 同じ値をOIDC_REDIRECT_URIへ                                                |
| Reference frontend | REFERENCE_APP_URL=http://localhost:3000                                                           | OIDC_FRONTEND_URL=http://localhost:3000、CORS_ORIGIN=http://localhost:3000 |
| 種別一覧の連携     | REFERENCE_INTEGRATION_API_URL=http://localhost:3001/api/v1、INTEGRATION_SERVICE_TOKENに別の生成値 | 同じ値をINTEGRATION_SERVICE_TOKENへ                                        |
| 管理者ID           | BOOTSTRAP_ADMIN_SUB=00000000-0000-4000-a000-000000000001                                          | 同じBOOTSTRAP_ADMIN_SUB（ローカル評価の既定ID）                            |

ReteのOIDC_COOKIE_KEYS等の認証鍵も雛形から評価用の生成値へ変更し、両backendを再起動します。Reteのclientはsecretとcallbackの両方を設定した時だけ有効です。往復を確認後、ReteでREFERENCE_OIDC_READY=trueを設定するとシステムの導線が有効になります。機械認証tokenを設定しない場合は種別一覧連携を評価できません。

## 空の評価DBにデータを入れ、ログインする

```bash
pnpm --filter @struct-pass/backend exec prisma migrate deploy
pnpm --filter @struct-pass/backend prisma:seed
pnpm dev
```

先にReteの評価DBへmigration・seedを実行し、Reteを起動してください。Referenceのseedはパスワードを保持せず、ロールとUser.oidcSubを作ります。ReteのAccount.idとReferenceのUser.oidcSubの一致が必要です。実体は[Referenceのseed](./packages/backend/prisma/seed/users.ts)とReteのpackages/backend/prisma/seed.tsです。

http://localhost:3000 を開き、Reteへ移動してログインします。初期管理者はReteのadmin@rete.local（SEED_ADMIN_EMAIL未設定時）です。Reteのローカル評価用パスワードは同リポジトリのseedにある公開fixtureであり、実運用の秘密ではありません。Referenceに独自のパスワードログインはありません。ログイン後は商品一覧・詳細、倉庫・在庫等をロールに応じて評価できます。

## 資料と検査

- [アーキテクチャ](./docs/02-architecture/ARCHITECTURE.md)
- [業務機能の索引](./docs/03-features/FEATURE_LIST.md)
- [開発ガイド](./docs/04-development/DEVELOPMENT_GUIDE.md)
- [セキュリティ報告](./SECURITY.md) / [第三者素材・依存](./THIRD_PARTY_NOTICES.md)

公開版のTest workflowは依存audit・書式・共有コード・Prisma・backend/frontendのcoverage・buildを検査し、本番AWS/EC2へ配布しません。残る依存指摘と検査の限定条件は[SECURITY.md](./SECURITY.md)に記載しています。解決された依存版は[pnpm-lock.yaml](./pnpm-lock.yaml)、版の目印は取得した公開commitです。メール送信、本番移行、全業務機能の動作保証を本書は提供しません。
