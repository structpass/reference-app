---
id: 0045
title: 伝票番号の採番を覚書ロック付きの raw SQL で行う
date: 2026-11-03
status: active
category: 逸脱
affected: packages/backend/src/common/repositories/document-number.repository.ts (generate / NumberSeries.readMax)
revisit: Prisma が「同一キーでの採番を直列化する」手段（行ロック・排他制約・採番専用のシーケンス）を公式に提供した時、または連番の最大値を SQL ではなく列として持つ形へ変えた時
---

## Context（このとき）

入荷・出荷・発注の伝票番号（`RCV-YYYYMMDD-NNNN`・`SHP-…`・`PO-YYYYMMDD-NNN`）は、画面から同時に作成されても重複してはいけない。番号は「種別 + 日本時間の暦日」ごとの連番で、既存の最大値 + 1 として決まる。

Prisma の通常の API だけでは、この「最大値を読んで +1 する」処理を並行実行に対して安全にできない。読んでから書くまでの間に別のトランザクションが同じ番号を採るためで、列に一意制約を置いても衝突した側が採番をやり直す仕組みが別途要る（採番のたびに衝突の再試行を書くことになり、桁上がりの扱いも散らばる）。

[構造の不変条件](../02-architecture/ARCHITECTURE_INVARIANTS.md)は、raw SQL を Repository 内に閉じたうえで、必要性と安全性を ADR へ記録することを求めている。在庫の ensure-row（[ADR 0005](0005-stock-lock-ensure-row-raw-sql.md)）は記録済みだが、採番については記録が無かった。

## Decision（こうした）

採番を `DocumentNumberRepository` に閉じ、種別ごとの設定（接頭辞・桁数・最大値の読み方）を持つ。処理は次の順で、呼び出し側のトランザクション上で行う。

1. `pg_advisory_xact_lock(namespace, hashtext(prefix))` で「種別 × 日付」単位のロックを取る。
2. 同じ接頭辞を持つ行の連番の最大値を `MAX(substring(no from '([0-9]+)$')::int)` で読む。
3. 最大値 + 1 を桁数ぶん 0 埋めして返す。

ロックはトランザクション終了時に自動で解放される。

## Reason（こういう理由で）

- **採番だけを別トランザクションにしない**: 採番と INSERT が同じトランザクションに無いと、採番した番号を使って行を作る前にロックが解け、別のトランザクションが同じ番号を採りうる。`pg_advisory_xact_lock` はトランザクションに紐づくため、この前提を型（`Prisma.TransactionClient` を受け取る形）で表せる。
- **ロックの粒度を「種別 × 日付」にした**: 全体で 1 本のロックにすると関係のない伝票どうしが待ち合う。接頭辞をキーにすることで、同時に採番されうる範囲だけを直列化する。
- **連番を数値の最大で求める**: 文字列の並び順で最大を取ると、桁上がり（`PO-…-999` の次）で順序が壊れる。`::int` へ変換して比べることで桁数に依らず正しく続く。
- **パラメータは tagged template で渡す**: `${prefix}` は prepared statement のパラメータになり、文字列結合による injection の余地を残さない。
- **ロック関数の戻り値を text へキャストする**: `pg_advisory_xact_lock` は `void` を返し、Prisma がその型を復元できない。`::text` にして読み捨てる。
- **採らなかった案（一意制約 + 再試行）**: 衝突のたびに採番をやり直す分岐が各所に散り、桁上がりの計算も重複する。直列化を 1 か所に閉じるほうが、後続が壊しにくい。
- **逸脱の範囲**: raw SQL は採番のロック取得と最大値の読み取りのみ。呼び出し側の Service は Repository を通しており、`Controller -> Service -> Repository -> Prisma` の依存方向は保たれている。
