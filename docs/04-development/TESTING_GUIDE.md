# テストガイド — Phase 2B 以降の標準パターン

> このドキュメントは「**spec を書くときに従う運用ルール**」を定義する。
> テスト設計の戦略・思想は [`TESTING_STRATEGY.md`](./TESTING_STRATEGY.md) を参照。
> テスト方針は [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) を参照してください。

---

## 1. Entity モックは factory 経由で作る（必須）

spec 内で entity 型の object literal を直書きするのは禁止。frontend / backend それぞれの factory を使う。

```ts
// Frontend
import { makeProduct, makeUser } from '@/__tests__/factories';

const product = makeProduct({ price: 9999 });
const admin = makeUser({ role: UserRole.SYS_ADMIN });

// Backend (mapper / service / repository spec)
import { makeProductEntity } from '@/__tests__/factories';

const entity = makeProductEntity({ price: new Prisma.Decimal('500.00') });
```

**理由**: shared型やPrisma型のドリフトをspecごとにコピーすると、列追加や型変更で全specが一斉に壊れる。[Architecture invariants](../02-architecture/ARCHITECTURE_INVARIANTS.md)の共有正本に従う。

**追加の必要が出たら**: `packages/{frontend,backend}/src/__tests__/factories/<entity>.factory.ts` に追加し、`index.ts` の barrel に export を 1 行追加。

---

## 2. Response DTO は `toMatchObject` で shape 検証する（必須）

`expect(result.success).toBe(true)` だけで終わらせない。返却 DTO の主要フィールドが期待 shape と一致することを最低 1 箇所で検証する。

```ts
// ❌ 不可
expect(result.success).toBe(true);

// ✅ 推奨
expect(result).toMatchObject({
  success: true,
  data: {
    id: expect.any(String),
    code: 'PRD-001',
    price: 1234.56,
    category: { id: 1, code: 'CAT-001' },
  },
});
```

**理由**: successフラグだけではshapeドリフト（mapperの戻り型変化やDTO field名変更）を検出できない。Response DTOのshapeも検証する。

**カバレッジ閾値**: 1 spec ファイルにつき 1 箇所以上 `toMatchObject` または同等の shape assert を含めること。

---

## 3. ユーザー interaction は `userEvent` を使う（必須）

`fireEvent` は React 19 + Concurrent rendering で flaky になるため使用禁止。`userEvent.setup()` パターンを使う。

```ts
// ❌ 不可
import { fireEvent } from '@testing-library/react';
fireEvent.click(button);

// ✅ 推奨
import userEvent from '@testing-library/user-event';

it('クリックでフォームが送信される', async () => {
  const user = userEvent.setup();
  render(<Form />);
  await user.click(screen.getByRole('button', { name: '保存' }));
  // ...
});
```

ESLint rule (`no-restricted-syntax`) で `fireEvent.*` は error として検出される。

### 3-1. 例外マーカー: `@allow-fireEvent`

keyboard event 等、`userEvent` で表現困難な低レベル DOM event のみ許容。

```ts
// eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: keyDown は user-event の表現外（ネイティブ event 必須）
fireEvent.keyDown(input, { key: 'Escape' });
```

**コードレビュー観点**: マーカー使用の justify が技術的に妥当か必ず確認（「面倒だったから」は却下）。

---

## 4. form spec は 3 ファイル split が標準

複数 form 系 spec は以下の 3 ファイル split を標準とする:

```
packages/frontend/src/__tests__/features/<entity>/components/
  ├ <entity>-form-base.test.tsx        # マウント / 初期表示 / field 表示
  ├ <entity>-form-validation.test.tsx  # validation エラー / field 別 error メッセージ
  └ <entity>-form-submit.test.tsx      # submit handler / 成功 / 失敗 / API call
```

### 4-1. 例外マーカー: `@form-single-file`

field 数 5 以下かつ validation 1-2 件以下の単純 form は 1 ファイル可。spec ファイル先頭に以下を明記:

```ts
// @form-single-file: field 数 3 / validation 1 件のため 3-split は過剰
```

### 4-2. 例外マーカー: `@form-doc-2-split`

明細行（line items）・商品検索 modal・複数 select など interactions が複雑な document 型 form
（orders / shipments / receivings / stocktakings 等）は、3-split ではなく
`<entity>-form-base.test.tsx` + `<entity>-form-interactions.test.tsx` の 2-split を維持してよい。

理由: validation / submit のみで分離すると interactions テスト群の置き場所が曖昧になり、
かえって 1 ファイルが肥大化する（master form の 3-split が前提とする「checkbox 1 個か combobox 1 個レベル」を逸脱）。

spec ファイル（base）の先頭に以下を明記:

```ts
// @form-doc-2-split: document 型 form (orders) は明細行・商品検索 modal など
// interactions が複雑なため、master form 3-split ではなく base + interactions の 2-split を維持。
```

`<entity>-form-base.test.tsx` には render / mode 切替 / 計算結果表示など、
`<entity>-form-interactions.test.tsx` には modal 起動 / combobox / 行追加・削除など
ユーザー操作系をまとめる（validation / submit を強引に分離しない）。

---

## 5. integration spec は `__tests__/integration/` 配下

page 単位 / journey 単位の integration spec は MSW を使って実 API 経路を通す。

```
packages/frontend/src/__tests__/integration/
  ├ pages/<entity>-list.integration.test.tsx     # page-level
  ├ pages/<entity>-detail.integration.test.tsx
  └ journeys/<flow-name>.integration.test.tsx    # 複数 page 跨ぎ
```

MSW handler は per-spec で `server.use(...)` で override する。デフォルト handler は `__tests__/mocks/handlers.ts`。

### 5-1. 例外: render-only ページ

純粋に静的 component render のみで API 呼び出しなしのページは integration spec 不要。
`packages/frontend/src/__tests__/integration/SKIPPED.md` に該当 page と理由を記録。

---

## 例外マーカー一覧

Phase 2B で導入した「意図が明確な例外」を許容するマーカー。

| マーカー                    | 用途                                                              | 検証                                         |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `@allow-fireEvent: <理由>`  | userEvent で表現困難な keyboard / native event                    | ESLint disable コメント直前 + コードレビュー |
| `@form-single-file: <理由>` | 単純 form の 1 ファイル spec                                      | spec 先頭コメント + コードレビュー           |
| `@form-doc-2-split: <理由>` | 明細行を持つ document 型 form の base + interactions 2-split spec | spec (base) 先頭コメント + コードレビュー    |

マーカー使用時は **必ず理由を技術的に書く**。「個人の趣味」「面倒」は却下。

---

## 関連リソース

- [テスト戦略](./TESTING_STRATEGY.md)
- [Architecture Invariants](../02-architecture/ARCHITECTURE_INVARIANTS.md)
- Frontend factory: `packages/frontend/src/__tests__/factories/`
- Backend factory: `packages/backend/src/__tests__/factories/`
- MSW handlers: `packages/frontend/src/__tests__/mocks/`
