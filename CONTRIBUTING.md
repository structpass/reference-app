# コントリビューションガイド

## Git フロー

本プロジェクトでは`main`を開発と本番配布の基準にします。

### ブランチ戦略

- `main` - 通常開発と本番配布の基準
- `feature/*` - レビューまたは隔離が必要な変更で使う短命ブランチ
- worktree - 並列作業を分離する必要がある場合に使用

### ブランチ命名規則

```
feature/<issue-number>-<short-description>
```

例:

- `feature/123-add-product-search`

## コミットメッセージ規約

Conventional Commits 形式を使用します。

### フォーマット

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメントのみの変更
- `style`: コードの動作に影響しない変更（フォーマット、セミコロン等）
- `refactor`: リファクタリング
- `test`: テストの追加・修正
- `chore`: ビルドプロセスやツールの変更

### 例

```
feat(products): add pagination to product list

- Implement server-side pagination
- Add page size selector
- Update API to support limit/offset

Closes #123
```

## コーディング規約

### TypeScript

- 厳密な型チェックを有効化
- `any` 型の使用は最小限に
- interface より type を優先（一貫性のため）
- ファイル名: kebab-case（例: `product-service.ts`）

### フォーマット

- Prettier を使用して自動フォーマット
- コミット前に `pnpm format` を実行

### Linting

- ESLint でコード品質を保証
- コミット前に `pnpm lint` を実行してエラーを修正

## テスト

### テスト実行

```bash
# ユニットテスト
pnpm test

# カバレッジ付き
pnpm test:cov

# E2Eテスト
pnpm test:e2e
```

### テスト品質基準

- カバレッジ 80%+ を維持
- 全テストが成功すること
- フレーキーテスト（不安定なテスト）を作らない

## プルリクエスト

### 作成前

1. `main`の現在状態と未コミット変更を確認
2. 必要な場合だけ短命ブランチまたはworktreeを作成
3. コードとテストを変更
4. Lint・Format・型・対象テストを実行
5. 差分とstage対象を確認
6. レビュー可能な単位でcommit

### PRテンプレート

```markdown
## 概要

変更内容の簡潔な説明

## 変更内容

- 変更1
- 変更2

## テスト

- [ ] ユニットテスト追加
- [ ] E2Eテスト追加
- [ ] 手動テスト完了

## チェックリスト

- [ ] Lint/Format 実行済み
- [ ] テストカバレッジ 80%+
- [ ] ドキュメント更新済み

## 関連Issue

Closes #<issue-number>
```

## 開発環境セットアップ

詳細は [DEVELOPMENT_GUIDE.md](./docs/04-development/DEVELOPMENT_GUIDE.md) を参照してください。

## 質問・サポート

Issue または Discussion で質問してください。
