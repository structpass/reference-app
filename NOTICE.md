# NOTICE

本リポジトリはPolyForm Free Trial License 1.0.0によるsource-availableの評価用ソースです。特定の用途に適するかを評価するための連続32暦日未満の利用を許諾します。評価以外の利用、評価期間を超える利用、再配布はこの許諾に含まれません。[LICENSE.md](./LICENSE.md)が正本です。別途の利用許諾は[contact@structpass.com](mailto:contact@structpass.com)へご相談ください。

## 評価用認証とデータ

ReferenceのログインはReteのOIDCを利用し、Referenceのseedにパスワードはありません。両seedの固定ID・ロールとReteのデモ資格情報は公開fixtureです。公開fixtureを実運用の資格情報として使用しないでください。

評価DBにはサンプルだけを入れ、loopbackで使用してください。外部接続や実データ投入前にOIDC issuer/client secret/callback、cookie鍵、integration token、認証・権限、接続先とDBを確認します。envを変更するだけでは既存Reteアカウントのパスワードは変わりません。該当アカウントを明示的に変更・無効化し、既存データと分離してください。Referenceのproductionではデモseedを実行しません。

ローカルの起動・連携は[README.md](./README.md)、問題の非公開報告は[SECURITY.md](./SECURITY.md)、第三者の利用条件は[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)を参照してください。
