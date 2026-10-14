# はじめに

ReferenceはReteをOIDCの認証元として利用する商品管理の参照実装です。両公開リポジトリをセットで取得し、Reteを先に起動してください。

ローカルの環境設定、ポート分離、共通client secret、seedのID対応、ログイン手順の正本は[公開README](../../README.md)です。ReferenceのロールはReferenceが持ち、パスワードとOIDCの認証はReteが持ちます。

## 次に読む資料

- [アーキテクチャ](../02-architecture/ARCHITECTURE.md)
- [設計の概要](../02-architecture/ARCHITECTURE_OVERVIEW.md)
- [業務機能](../03-features/FEATURE_LIST.md)
- [開発ガイド](../04-development/DEVELOPMENT_GUIDE.md)
- [テスト方針](../04-development/TESTING_STRATEGY.md)
- [利用条件と安全な評価](../../NOTICE.md)
- [非公開のセキュリティ報告](../../SECURITY.md)

公開版に社内の開発指示書・計画・本番CDは含みません。製品の機能や設定は、取得したcommitのコードと収載された仕様へ照合してください。
