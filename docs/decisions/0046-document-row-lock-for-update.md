---
id: 0046
title: 伝票行の状態判定・確定・論理削除を、FOR UPDATE の行ロックで直列化する
date: 2026-11-03
status: active
category: 逸脱
affected: packages/backend/src/modules/orders/repositories/orders.repository.ts (lockByIdInTx) / packages/backend/src/modules/receivings/repositories/receivings.repository.ts (lockByIdWithLinesInTx) / packages/backend/src/modules/shipments/repositories/shipments.repository.ts (lockByIdWithLinesInTx) / packages/backend/src/modules/stocktakings/repositories/stocktakings.repository.ts (lockByIdInTx)
revisit: Prisma が「トランザクション内での行ロック取得」を公式に提供した時、または伝票の状態遷移を楽観ロック（版番号）へ変える時
---

## Context

入荷・出荷・発注・棚卸の伝票は、状態（下書き・確定など）を持ち、確定すると明細と在庫が動く。同じ伝票に対して確定と取消が同時に走ると、片方が読んだ古い状態のまま書き込み、在庫が二重に動いたり、確定済みの伝票が取り消されたりする。

状態は「読む → 判定する → 書く」の 3 段で扱うため、その間に行が変わらないことを保証する必要がある。Prisma の通常の API だけでは、トランザクション内で対象行のロックを取る手段がない。

[構造の不変条件](../02-architecture/ARCHITECTURE_INVARIANTS.md)は、raw SQL を Repository 内へ閉じたうえで、必要性と安全性を ADR へ記録することを求めている。4 つの伝票はどれも同じ形で raw SQL を使っているが、記録が無かった。

## Decision

伝票行を触るトランザクションの先頭で、`SELECT ... FOR UPDATE` により対象行の行ロックを取る。ロックの後に状態と明細を読み直し、Service はその固定値だけで認可と遷移を判定する。

```sql
SELECT "id" FROM "orders" WHERE "id" = ${id} AND "deleted_at" IS NULL FOR UPDATE
```

入荷・出荷は明細も同時に読む（`lines` を含めて返す）。棚卸は論理削除を持たないため条件が異なる。

## Reason（こういう理由で）

- **`FOR UPDATE` を選ぶ**: 状態の読み直しから書き込みまで、他のトランザクションに割り込ませない。楽観ロック（版番号）だと競合時に呼び出し側がやり直す必要があり、確定のような副作用の大きい操作では再試行の設計が重くなる。
- **文書ロックを在庫ロックより先に取る**: 確定は在庫も動かす。文書 → 在庫の順序を全経路で揃えることで、2 つの伝票が互いの在庫を待ち合う循環を作らない。
- **ロックの後に読み直す**: ロック待ちの間に他のトランザクションが状態を進めている可能性がある。ロック後の値を Service へ渡すことで、古い状態にもとづく判定を防ぐ。
- **論理削除の条件を SQL に含める**: 削除済みの伝票はロックの対象から外す。存在しない行をロックしようとしても何も起きないため、呼び出し側が「ロックできたか」を取り違えないよう、条件を SQL に明示している。
- **逸脱の範囲**: raw SQL はこのロック取得の 1 文のみ。読み直しと書き込みは Prisma の API を使っており、`Controller -> Service -> Repository -> Prisma` の依存方向は保たれている。
