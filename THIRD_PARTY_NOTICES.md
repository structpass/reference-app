# 第三者素材・依存パッケージ

[LICENSE.md](./LICENSE.md)はReference自身のコードの利用条件であり、第三者の許諾を置き換えません。

## フォント・アイコン

| 素材         | 利用箇所                          | 出所・ライセンス原文                                                                           |
| ------------ | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Geist        | frontend layout、next/font/google | [Google Fonts / SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/geist/OFL.txt)      |
| Noto Sans JP | frontend layout、next/font/google | [Google Fonts / SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/notosansjp/OFL.txt) |
| Lucide       | lucide-reactのアイコン            | [ISC・一部MIT表示](https://github.com/lucide-icons/lucide/blob/main/LICENSE)                   |

ソースにnode_modulesやフォントバイナリは同梱しません。ビルド時のフォント取得にはネットワーク接続が必要です。別途許諾の下でビルド成果物を配布する時は、実際に同梱する版のLICENSE・NOTICE・著作権表示を保持してください。

## npm依存

### magicastの組み込み依存修復

`magicast@0.5.5`に組み込まれたsource-map-jsは[pnpm patch](./patches/magicast@0.5.5.patch)で修復します。組み込みコードの修復と互換性は `pnpm run test:security` で検証します。依存のLICENSE・著作権表示は修復後も保持しています。

### 監査例外にしている依存

`braces` の GHSA-vfj7-8cjw-p6xm（High）は上流に修正版がないため、ローカル patch は適用せず、`package.json` の `pnpm.auditConfig.ignoreGhsas` による監査例外として記録しています。判断の理由は開発リポジトリの ADR 0023 に残しています。上流に修正版が出た時点で、override と例外をまとめて外す方針です。この例外は監査の合格や製品全体の安全性の保証ではありません。

`patches/` に含まれる patch は `magicast@0.5.5.patch` のみです。公開CIは `pnpm audit --audit-level=high` を維持し、監査が失敗した場合も修復の回帰検査を実行します。

名前と用途は[frontend](./packages/frontend/package.json)、[backend](./packages/backend/package.json)、[shared](./packages/shared/package.json)、[root](./package.json)のmanifest、解決された版は[pnpm-lock.yaml](./pnpm-lock.yaml)が正本です。NestJS / Prisma / OIDC client / Next.js / React / テスト・build等の直接・間接依存の利用条件は、インストールした該当版の原文を確認してください。

seed・E2Eは評価用のサンプルです。サンプルの人物や組織を実利用者として扱わないでください。この索引は配布物全体の権利審査・許諾取得を保証するものではありません。
