# セキュリティ報告

Reference公開候補の認証・権限、商品・倉庫・在庫等のAPI、情報漏洩、依存パッケージを対象とします。取得したcommitと影響する機能・ファイルを示してください。サポート期間・返信期限の保証は設けていません。

脆弱性や情報漏洩は[contact@structpass.com](mailto:contact@structpass.com)へ、件名「Reference セキュリティ報告」で非公開にお送りください。公開Issue・PR・Discussionへ未修正の再現手順、秘密鍵、パスワード、token、個人情報・実データを投稿しないでください。

ReferenceのログインはReteが担います。公開fixtureの存在と実運用秘密の漏洩を区別し、既定の資格情報が実運用で有効なら明示的な変更・無効化が必要です。秘密を誤って公開した場合は値を報告へ転載せず、先に失効・変更し、掲載場所と影響範囲を非公開窓口へ連絡してください。

安全なローカル評価は[README.md](./README.md)と[NOTICE.md](./NOTICE.md)を参照してください。

## 残存する依存指摘

公開候補の依存監査（`pnpm audit`）は、監査例外を除いて Critical 0件、High 0件、Moderate 0件、Low 0件です。修正版が公開されている指摘は、直接依存・間接依存とも公式版へ更新済みです。`magicast` に同梱された `source-map-js` は pnpm patch で修復しています（`patches/magicast@0.5.5.patch`、回帰検査は `pnpm run test:security`）。

上流に修正版が無い `deepmerge` の GHSA-gcqx-w48m-w2h4（Low）だけを、`package.json` の `pnpm.auditConfig.ignoreGhsas` で監査例外として記録しています（`patched_versions` が `<0.0.0`）。到達するのは `@nestjs/cli` 配下と jest 系の開発・ビルドのツールチェーンだけで、本番 backend イメージは `--prod` で dev 依存を剪定します。判断の理由は開発リポジトリの ADR 0041 に残しています。**ローカル patch は適用していません**（上流に修正版が出た時点で例外を外す方針です）。`braces` の GHSA-vfj7-8cjw-p6xm は上流の勧告が撤回されたため、例外にも残していません。監査指摘の存在と、製品で実際に攻撃が到達することの証明は別物として扱ってください。

公開CIは `pnpm audit --audit-level=high` を維持します。監査が失敗した場合も修復の回帰検査は実行しますが、その成功で監査の失敗を取り消しません。評価・公開可否の判断には、その時点の依存監査と同じ候補の検証結果を使ってください。
