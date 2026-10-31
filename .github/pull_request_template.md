# Summary

<!-- 1-3 行で「何を」「なぜ」を記述。長文は不要。 -->

## 変更内容

<!-- バレットリストで主な変更 -->

-

## テスト

<!-- どう動作確認したか。手動テストの手順 / 追加した spec の概要 -->

- ***

## チェックリスト

### Architecture Invariants（必須）

- [ ] §1 Response DTO 定義（Service / Controller は entity を直返ししていない）
- [ ] §2 Repository 経由（Service が ORM を直接呼んでいない）
- [ ] §7 spec が DTO shape を検証している（`expect(success).toBe(true)` だけで終わっていない）
- [ ] shared 型を 1 箇所以上で使用（該当時）

### Test Guide 準拠（必須 / `docs/04-development/TESTING_GUIDE.md` 参照）

- [ ] entity モックは `__tests__/factories/` 経由（spec 内で直書きしていない）
- [ ] response DTO の shape を `toMatchObject` 等で検証
- [ ] ユーザー interaction は `userEvent` を使用（`fireEvent` 使用時は `@allow-fireEvent:` マーカー + 理由）
- [ ] form spec は 3-split 標準（1-file は `@form-single-file:` マーカー + 理由）

### 例外マーカー妥当性

- [ ] `@allow-fireEvent` / `@form-single-file` を追加した場合、理由が技術的に妥当（「面倒だった」は却下）

### その他

- [ ] `pnpm lint` 通過
- [ ] `pnpm test` 通過
- [ ] `pnpm build` 通過
- [ ] 関連ドキュメント更新（必要時）

---

## 関連 Issue / Plan

<!-- 該当する plans/*.md / Issue 番号 -->

-
