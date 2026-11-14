---
id: 0032
title: 利用者更新の保護状態を、拡張 where ではなく行ロック下の読み直しで再評価する
date: 2026-10-13
status: active
category: 外部制約
affected: packages/backend/src/modules/users/repositories/users.repository.ts, packages/backend/src/modules/users/users.service.ts, packages/backend/test/users-allow-link-race.int-spec.ts
revisit: Prisma が 0 件一致の `update` を例外ではなく `null`（または原因つきの結果）で返すようになった時、または users の主キー種別が変わる時
---

## Context（このとき）

SYS_ADMIN が `allowOidcLink=true` を commit した後、非 SYS_ADMIN が同じ行のメールを差し替えられる経路が実測で確認された。`users.service.update` は `findById` の状態で認可と保護判定を行い、その後 `findByEmail` を await してから `users.repository.update(id, data)`（`where` は `id` だけ）を呼ぶ。判定と書き込みが別の文であるため、読み取り後に状態が変わっても古い判定のまま書き込まれる。`linkOidcSub` はメール一致を唯一の引き当てキーにするので、これは「許可の宛先」を後から付け替えられることに等しい。

修復の要求は手段まで名指ししていた: **Prisma 6 の拡張 `where` を持つ `update` で期待状態を同じ UPDATE で再評価し、条件不一致を Repository の型付き結果で不在と状態変更に分け、Service で 404 または 409 へ写す**。同時に `updateMany` の `count=0` で不在を判定する方式は禁じていた。

## Decision（こうした）

**要求が名指しした手段は採らず、行ロックの下で最新行を読み直して判定し、同じトランザクションで書き込む形にした**（`UsersRepository.updateGuarded`）。不在はロック取得の結果（0 行）が持ち、状態変更はロックした最新行と期待状態の照合結果が持つ。型付き結果（`missing` / `stateChanged` / `updated`）で両者を分け、Service は 404 / 409 / 200 へ写す。

対象行の固定は `FOR NO KEY UPDATE`。同じ行への素の `prisma.user.update` も同じ強さを取るため衝突し、`FOR SHARE` は使わない。

## Reason（こういう理由で）

要求の手段が受入条件を満たせないことを、使い捨て PostgreSQL16 と現行 migration、`@prisma/client` 6.19.2 で実測した。

- **不在と状態変更を区別できない。** 拡張 `where` を持つ `update` は 0 件一致で `null` を返さず **P2025 を投げる**。しかも「行は在るが期待状態と違う」と「行そのものが無い」で `meta` まで同一だった（どちらも `{modelName:'User', cause:'No record was found for an update.'}`）。`meta` に差が無いため、例外を解釈しても 404 と 409 を出し分けられない。
- **`where` の字面が実行できない。** `oidcSub` は `String? @unique` のため `UserWhereUniqueInput` では `oidcSub?: string`（非 null）と型付けられ、`oidcSub: null` は `PrismaClientValidationError`（`Argument 'oidcSub' must not be null`）になる。`AND: [{ oidcSub: null }]` なら通るが、これは要求の字面ではない。
- **禁じられた方式も同じ壁に当たる。** `updateMany` の `count=0` は言うまでもなく、`updateManyAndReturn` の `rows.length === 0` も不在と状態変更で同一（どちらも `[]`）だった。加えて `updateManyAndReturn` は空 `data` で `syntax error at or near "WHERE"` になり、「空 `data` でも既存行を返す」契約を満たせない。

一方、採った形の前提は実測で成立した。

- 先行が `FOR NO KEY UPDATE` を保持している間、後続の素の `update` は待たされる（実測: 377ms）。**待たされた後に必ず拒否されるわけではない** — 待ちが解けると条件は再評価されるため、条件を満たす書き込みは通る。したがって判定根拠は「待たせること」ではなく、**同じトランザクションの中で照合と書き込みを行うこと**にある。ガードは行ロックを commit まで保持するので、照合の後に別のトランザクションが同じ行を書くことはない。
- 素の並行実行（非 SYS_ADMIN のメール変更と SYS_ADMIN の許可を同時に投げる）を 20 回・40 回で測り、危険な組み合わせ（攻撃者のメール＋許可済み）は **0 回**、ガードは**毎回 409** だった。事前読取の後に許可が commit された状況を作為して古い期待値で呼ぶと `stateChanged` になる。
- ロックした最新行の照合で `missing` / `stateChanged` / `updated` の3状態が区別できた。
- 空 `data` でも行が返り、`update` の既存契約を維持できる。

**固定の強さは `FOR SHARE` ではなく `FOR NO KEY UPDATE` を採る。** どちらも上の窓は閉じるが、`FOR SHARE` は `users` を参照する行の挿入（外部キー検査の `FOR KEY SHARE`）まで待たせる。実測では、`FOR SHARE` 保持中の所属追加が **341ms** 待たされ、`FOR NO KEY UPDATE` なら **6ms** で通った。利用者の編集と無関係な所属追加を止めない側を採る。逆向き（参照行の挿入を保持したままの更新）も `FOR NO KEY UPDATE` は待たされない（36ms）。この選択は統合テストで固定してあり、`FOR SHARE` へ戻すと赤くなる（実測で確認）。

この形は既存の `groups.repository.ts` の `updateIfPresent`（ADR 0029）と同じ家風・同じ強さで、`updateMany` の `count` を採らない理由もそこで既に実測されていた。2つの流儀を併存させない。

`users.id` は `text` なので、`FOR NO KEY UPDATE` の生 SQL に uuid キャストを付けない（付けると `42883 operator does not exist: text = uuid`）。グループ側は主キーが整数で事情が異なるため、字面を写経しない。

既知の不完全さ（許容したもの）:

- **ロック待ちが 60 秒を超える場合は P2028 → 503 のまま残る。** `groups.repository.ts` と同じ `{ timeout: 60_000, maxWait: 10_000 }` に揃えた。再送で解ける一時的な状態である。
- **`name` / `status` は期待状態に含めない。** 保護対象ではないため、含めると無関係な同時編集で 409 を出す過剰な拒否になる。
- **直列の2段操作（非 SYS_ADMIN がメール変更 → SYS_ADMIN がその新しいメールへ許可）は閉じない。** 実測: この順序だと両方 200 で「攻撃者のメール＋許可済み」が残る。ただし成立には **SYS_ADMIN が攻撃者のメールへ許可を立てる**必要があり、ADR 0027 が「SYS_ADMIN 自身が不正を行う経路は残る」として既知の不完全さに挙げたものと同じである。本 ADR が閉じたのは「SYS_ADMIN が正規に許可した行のメールを、非 SYS_ADMIN が後から差し替える」競合（許可が先、差し替えが後）で、こちらは 409 で閉じている。
- **`provisionFromOidc` の `update`（`users.service.ts` の2箇所）は `updateGuarded` にしていない。** 同じ sub の行の `email` を claim で更新する（実測で付け替わる）が、その行は既に `oidcSub` を持つため `linkOidcSub` の「未連携」条件に当たらず、別 sub は同じ行へリンクできない。IdP を identity の正本とする既存設計どおりで、本 ADR の対象外。

## 関連

- Board チケット: v2-484（SSO連携許可とメール更新の競合で、許可済み行のメールを非 SYS_ADMIN が差し替えられる）
- 前提の判断: ADR 0027（SSO 連携の許可と、許可済み利用者のメール変更を SYS_ADMIN に限る）
- 同じ家風の実装: `groups.repository.ts` の `updateIfPresent`（ADR 0029）
