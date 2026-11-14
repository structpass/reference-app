---
id: 0029
title: グループ更新の「行が無い」を、行ロックの取得結果で判定して逐次と同じ 404 に揃える
date: 2026-10-11
last_updated: 2026-10-13
status: active
category: trade-off
affected: packages/backend/src/modules/groups/repositories/groups.repository.ts, packages/backend/src/modules/groups/groups.service.ts, packages/backend/src/modules/groups/groups.service.spec.ts, packages/backend/src/modules/groups/dto/update-group.dto.ts, packages/backend/test/groups-delete-race.int-spec.ts, packages/backend/test/groups-write-guards.e2e-spec.ts, docs/02-architecture/API_REFERENCE.md, docs/decisions/README.md
revisit: グループ更新を PATCH へ寄せる時、または Prisma 例外の写像を経路ごとの文言まで含めて一本化する時
---

## Context（このとき）

v2-428 の独立レビューが、削除側（同時 DELETE）を閉じた後の残りとして**更新側の同型**を実測した（Board artifact af3f0145）。`PUT /api/v1/groups/:id` は `findById` で存在を確かめた後に `group.update` を投げるため、確認と更新の間に別トランザクションが同じ行を削除して commit すると、ロック待ちから戻った `group.update` が P2025（No record was found for an update）を投げる。実測では `500 INTERNAL_ERROR`（ロック待ち 4171ms）だった。

v2-446 の着手時に測り直すと、**500 は既に閉じていた**。v2-447（`e899ebb`）が `app.module.ts` の `APP_FILTER` 登録順を直し、`PrismaExceptionFilter` の P2025 → 404 写像を HTTP 経路で効かせたためである。ただし残ったのは**同じ「行が無い」状態に応答が2通りできる**ことで、経路ごとに文言が違っていた。

- 競合した経路: `404 NOT_FOUND` / `対象のレコードが見つかりません`（`PrismaExceptionFilter` の固定文言）
- 逐次の経路（存在しない id）: `404 NOT_FOUND` / `Group not found`（service の `findById` 検査）

文言は frontend の `extractErrorMessage` → `use-crud-api` のトーストへそのまま出る。同じモジュールの DELETE は v2-428 で既に「逐次と同じ `Group not found`」へ揃えており、更新だけ非対称だった。

## Decision（こうした）

1. **更新側にも行ロックの取得結果による不在判定を置く。** `GroupsRepository.updateIfPresent(id, data)` が `$transaction` 内で `SELECT id FROM groups WHERE id = ${id} FOR NO KEY UPDATE` を投げ、0 行なら更新を投げずに `null` を返す。service は `null` を `NotFoundException('Group not found')` へ写す（既存の逐次経路と同じ文言）。
2. **`update` は残さず `updateIfPresent` へ置き換える**（呼び出し元は `groups.service.update` の1か所のみ）。不在の判定が2通りにならない。
3. **固定は `FOR NO KEY UPDATE` にする**（独立レビュー F-2）。不在判定に必要なのは「DELETE と衝突すること」だけで、素の `FOR UPDATE` は外部キー検査の `FOR KEY SHARE` とも衝突し、同じグループへの所属追加・掲示の宛先追加を更新の commit まで待たせる。
4. **`$transaction` に明示の timeout（`{ timeout: 60_000, maxWait: 10_000 }`）を渡す**（独立レビュー F-1）。既定の 5 秒に掛かると、5 秒超のロック待ちが P2028 → 503 になり、旧実装の 404 に対して退行する。
5. **P2025 は解釈しない。** Prisma エラーはそのまま再スローして `PrismaExceptionFilter` に委譲する既存規約を維持する。
6. **`updateMany` の `count` で不在を判定する案は採らない**（後述の実測で破綻する）。
7. 同じレビューの記載2件（`API_REFERENCE` の PUT 応答集合へ `409 Conflict` を追加、`update-group.dto` の `description` へ `nullable: true` を追加）も実体へ追随させる。

## Reason（こういう理由で）

- **`deleteIfUnreferenced`（v2-428）と同じ形にした。** 既に「固定の取得そのものを在否の判定に使う」形が同じ repository にあり（ADR 0025 決定2）、同じモジュールの削除と更新で判定の置き場が2通りになるのを避ける。固定が 0 行になるのは READ COMMITTED の再評価によるもので、先行の削除が commit 済みでも P2025 の余地が残らない。固定を取った後は commit まで行ロックを保持するため、更新までの間に同じ行を他のトランザクションが消せない。
- **固定の強さは `FOR NO KEY UPDATE` に留める（F-2）。** 実測（v2-446）: `FOR UPDATE` の保持中は所属追加（`user_groups` への INSERT）が 1511ms 待たされるが、`FOR NO KEY UPDATE` なら 2ms で通過する。同時 DELETE は `FOR NO KEY UPDATE` でも 1515ms 待って 0 行を見るため、**不在判定の能力は落ちない**。旧実装の `group.update` が取るロックと同じ強さでもある。**ただしこの弱めが効くのは非キー列（`name` / `role` / `status` / `description`）の更新まで**で、`code`（unique キー）を変更する更新は PostgreSQL がキー列の更新に `FOR UPDATE` 強度を要するため、所属追加を待たせる（実測: 非キー列 17/8/5ms に対し `code` 変更は 2539ms）。旧実装の `code` 変更も 2504ms 待つので退行ではない。
- **timeout を明示する（F-1）。** 実測（v2-446）: 7 秒のロック保持で、旧形（autocommit の単文 `update`）は P2025（→ 404）、timeout 未指定の新形は P2028（→ 503）、明示 timeout の新形は 0 行を見て `null`（→ 404）。**明示しないと、この票が消そうとした「同じ『行が無い』状態に応答が2通りできる」欠陥が 404 と 503 の形で残る。** 値は `products.repository.ts` の一括取込と同じ `{ timeout: 60_000, maxWait: 10_000 }` に揃える。
- **`updateMany` の `count` を見る案（追加クエリも P2025 の解釈も不要で一見良い）は、実測で破綻した。** `updateMany({ where: { id }, data: {} })` は**既存行でも `count: 0`** を返し（実測: v2-446。行が無い場合と同じ値）、`update({ data: {} })` は行を返す。`UpdateGroupDto` は全項目が任意で空ボディの PUT が通るため、この形にすると**存在するグループへの空ボディ更新が偽の 404 になる**。回避には `data` が空かどうかの分岐が要り、「count で判定する」利点が消える。
- **`updateManyAndReturn` で1文にする案も採らない。** 空 `data` で PostgreSQL の `42601`（syntax error）を `PrismaClientUnknownRequestError` として投げ、現状の P2025 より重い `500 INTERNAL_ERROR` になる（実測: v2-446）。
- **P2025 を repository で捕まえて `null` にする案は採らない。** ADR 0025 が「ロック後に消えていた場合と想定外の競合を区別できず、失敗を成功に化けさせる」として既に棄却しており、加えて P2025 の意味を持つ場所がグローバルフィルタと repository の2か所になる。

既知の不完全さ（許容したもの）:

- **同一行の更新が直列化される。** 固定を取るため、同じグループへの同時更新はロック待ちで順番待ちになる（後勝ちは従来どおり）。管理画面のマスタ編集の頻度では実害が無い。
- **ロック待ちが 60 秒（明示 timeout）を超えると P2028 → 503 のまま残る。** 再送で解ける一時的な状態で、旧実装でも同じ級の待ちはクライアント側の timeout に掛かる。境界をどこに置くかは負荷試験の材料が無いため、既存の一括取込と同じ値へ揃えるに留めた。
- **削除側（`deleteIfUnreferenced`）の 5 秒の崖は v2-463 で閉じた。** 本票の時点では timeout を明示していないため 7 秒保持で P2028 → 503、4 秒では `missing: true` → 404 になり、同じモジュールの中で update と delete の timeout が非対称だった（独立レビュー F-3）。v2-463 が削除側にも同じ `{ timeout: 60_000, maxWait: 10_000 }` を渡し、5 秒超の保持で `missing: true`（→ 404 相当）になることと、timeout 無しの旧形が P2028 になることを統合テストで固定した（`groups-delete-race.int-spec.ts` の「グループ削除の timeout (v2-463)」）。削除は数え直しの2クエリだけなので更新より短い上限でも足りる可能性があったが、待ち時間の主因はクエリの長さではなく固定の保持時間で、同じ行に対する update と delete で崖の位置が2通りにならないことを優先し、更新側と同じ値に揃えた（**同じ60秒の境界は削除側にも残る**）。
- **`findById` の事前検査は残る。** 権限検査と 409 判定が `existing` の値を使うため外せない。以後の 404 は「速い方の検出」であり、P2025 の防波堤ではなくなる。
- **更新は引き続き `PUT` + Partial（未指定は変更しない）。** `PATCH` との意味の揺れは残る（ADR 0025 から継続）。
- **`groups.service.spec.ts` の既存 drift を一緒に整形した。** このファイルは base の時点で prettier 非準拠だった（v2-425 のコミットで入った折返し。詳細は下記）。宣言した format の check はファイル単位のため、ファイル全体へ prettier をかけて通した結果、依頼に直結しない箇所も整形されている（意味は不変で、空白と末尾カンマを正規化すると base と一致する）。独立レビューもこの扱いを妥当と判断した（F-5 / INFO）。
- **整形された箇所の内訳。** base の非準拠は4ハンク。内訳は `mockRepo.update.mockResolvedValue(...)` の折返し2件と `await expect(...)` の折返し2件で、いずれも base では prettier が折り返しを変える状態だった。成果物では、前者2件は改名（`update` → `updateIfPresent`）で行が `printWidth`（100）を超えたため prettier の整形結果が base と同じ折返しになり（見た目の差分は改名のみ）、後者2件は prettier が折り返しを変えた。4ハンクすべてが成果物では準拠になっている。

## 関連

- Board チケット: v2-446（グループの更新が、同じグループの削除と重なると 500 になる）
- 実測の出どころ: v2-428 の独立レビュー（Board artifact af3f0145）
- 同じ削除経路の前判断: ADR 0025（グループ更新の null と同時削除）
- 前提を変えた別チケット: v2-447（Prisma の P2025 → 404 の写像が HTTP 経路で効いていなかった）
- 同型の残りを引き継ぎ、削除側の崖を閉じた別チケット: v2-463（グループ削除の行ロック待ちが既定 timeout を超えると 503 になる）
