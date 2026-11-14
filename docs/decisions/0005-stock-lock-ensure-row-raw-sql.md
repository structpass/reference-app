---
id: 0005
title: 在庫行ロックの ensure-row を Prisma upsert ではなく明示 raw SQL で書く
date: 2026-05-29
status: active
category: 逸脱
affected: packages/backend/src/modules/stocks/repositories/stocks.repository.ts (lockStockForUpdate)
revisit: Prisma が「空 update の upsert でも競合行に行ロックを取得する」ことを公式に保証・明文化した時、または raw SQL の保守（ON CONFLICT 句のスキーマ追従）が負担化した時
---

## Context（このとき）

/reviews 2026-05-29 で検出した CODE-H3（在庫ロックの致命バグ）の返済中の判断。`lockStockForUpdate` は `SELECT ... FOR UPDATE` で在庫行に悲観ロックを取るが、`SELECT ... FOR UPDATE` は「存在しない行」をロックできない。初回入荷など stock 行が未作成の (warehouse, product) では行ロックが取得できず、同時実行が直列化されないため StockAdjustment の before/after 監査値が壊れる。

開発統括判断で「行を保証 → FOR UPDATE」方針（advisory lock は後続者の可読性を優先して不採用）を採用済み。この「行を保証」の書き方を、Prisma の `tx.stock.upsert({ where, update: {}, create: { quantity: 0 } })`（ORM idiom）で書くか、明示 raw SQL（`INSERT ... ON CONFLICT DO UPDATE SET quantity = stocks.quantity`）で書くかが論点になった。Quality cycle の database-reviewer が「空 update の upsert はロック取得が脆い（db H-1）」と指摘した。

## Decision（こうした）

ensure-row を Prisma upsert ではなく明示 raw SQL（tagged template の `tx.$executeRaw`）で書いた。

```sql
INSERT INTO "stocks" ("warehouse_id", "product_id", "quantity")
VALUES (${warehouseId}, ${productId}, 0)
ON CONFLICT ("warehouse_id", "product_id") DO UPDATE
  SET "quantity" = "stocks"."quantity"
```

`ON CONFLICT DO UPDATE` は SET が値の no-op でも競合行に行ロックを取得するため、同時初回入荷の 2 つ目の INSERT が競合でブロックし直列化される。tagged template により `${...}` は prepared statement パラメータ化される（injection セーフ）。コード中コメントで「文字列結合へ変えないこと」を明記した。これは architecture-invariants の「Repository が ORM Client 経由で DB に触る（§2）」に対する、ロック取得部分のみ raw SQL を使うという意図的逸脱にあたる。

## Reason（こういう理由で）

- **空 update の upsert はロック保証が version 非依存でない**: Prisma が空 `update: {}` を将来 `DO NOTHING` に最適化すると、競合行に行ロックが取得されず CODE-H3 が再発する。Prisma は「空 update でも行ロックを取る」ことを公式に保証していないため、ORM の内部コンパイル挙動にロック正当性を依存させたくなかった。
- **ロック取得の意図を SQL に明示できる**: `ON CONFLICT DO UPDATE SET quantity = stocks.quantity` と書くことで「競合時も必ず UPDATE = 行ロック取得」の意図がコードに直接表れ、後続実装者が壊しにくい。直下の `FOR UPDATE` も同じ raw 経路で書かれており、ロック関連は raw に集約されて一貫している。
- **採らなかった案（Prisma upsert）**: 可読性は高いが上記のロック保証リスクを抱える。参照実装としてアンチパターン耐性（version 非依存の正しさ）を優先し見送り。
- **逸脱の範囲を限定**: raw SQL は `lockStockForUpdate` のロック取得 2 文のみ。通常の CRUD（upsertStockIncrement / upsertStockOverwrite 等）は Prisma idiom を維持しており、§2 の逸脱は「悲観ロック取得」という raw が本質的に適する箇所に閉じている。
