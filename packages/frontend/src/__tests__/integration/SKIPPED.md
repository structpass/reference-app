# Integration spec — 未着手 / Skipped 一覧

Phase 2B-3 で導入した integration spec の現状と、残務リスト。
各 entry は「なぜ未着手か」「次に着手するときの最小手順」を記録する。

## 着手済 (13 page + 1 journey)

### page-level

| Path                                            | Type       | 検証ポイント                                                            |
| ----------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `pages/products-list.integration.test.tsx`      | page-level | list / category filter / 権限欠如時 / 500 / per-spec override           |
| `pages/categories-list.integration.test.tsx`    | page-level | list / 500 / per-spec override                                          |
| `pages/suppliers-list.integration.test.tsx`     | page-level | list / 権限あり時の新規登録ボタン / per-spec override                   |
| `pages/carriers-list.integration.test.tsx`      | page-level | list / per-spec override / 空応答                                       |
| `pages/warehouses-list.integration.test.tsx`    | page-level | list / per-spec override                                                |
| `pages/groups-list.integration.test.tsx`        | page-level | list / per-spec override / 権限欠如時                                   |
| `pages/users-list.integration.test.tsx`         | page-level | list / Badge 状態描画 / per-spec override / 権限欠如時                  |
| `pages/permissions-matrix.integration.test.tsx` | page-level | matrix 描画 / 空 matrix / API 500 で toast.error                        |
| `pages/stocks-list.integration.test.tsx`        | page-level | warehouse + product pivot / per-spec override / 空応答                  |
| `pages/orders-list.integration.test.tsx`        | page-level | document list (totalAmount / supplier) / per-spec override / 権限欠如時 |
| `pages/shipments-list.integration.test.tsx`     | page-level | document list (destination) / per-spec override / 権限欠如時            |
| `pages/receivings-list.integration.test.tsx`    | page-level | document list (supplier) / per-spec override / 権限欠如時               |
| `pages/stocktakings-list.integration.test.tsx`  | page-level | document list (warehouse / 担当者) / per-spec override / 権限欠如時     |

### journey

| Path                                               | Type    | 検証ポイント                                    |
| -------------------------------------------------- | ------- | ----------------------------------------------- |
| `journeys/master-delete-flow.integration.test.tsx` | journey | 行削除 → 確認 dialog → DELETE → reload で行消失 |

## 未着手 — 続編で追加する journey

| Journey           | 説明                                              | 着手時の補足                                                                                                  |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Order workflow    | 発注作成 → list → 詳細で確定 → 入荷               | `/orders` POST + GET + PATCH の handler 連携が必要                                                            |
| Receiving in-out  | 入荷登録 → 棚卸で在庫差異検出 → 調整              | document → stocks 跨ぎ。fixture が複雑なため後回し                                                            |
| Permission denial | 権限なしで dashboard navigate → CRUD ボタン非表示 | `deniedPermissionsHandler` で多 page を回す。各 page-level spec で部分的に検証済のため統合 journey は重要度低 |

## render-only / 静的 page (integration spec 不要)

API call のない静的 component / pure render のみのページはここに記録する。
現時点では該当なし（auth / login / change-password は API call を持つが、
それぞれ feature spec で網羅済のため integration では二重テストしない方針）。

| Page   | 理由 |
| ------ | ---- |
| (なし) | —    |

## 共通 patterns（書き始め時に確認）

- `vi.mock('next/navigation', ...)` は必須。`useRouter` を使う page は全部
- `vi.mock('react-hot-toast', ...)` は toast 副作用のサプレス用
- 権限が必要な ConfirmDialog / 新規登録ボタン等を検証する場合、`allPermissionsHandler` (default) のままでよい。否定形検証時は `server.use(deniedPermissionsHandler)`
- list spec の最低 3 ケース構成: ① 描画 ② override ③ 失敗系 / 権限欠如 / 空応答 などのうち 1 件
- filter dropdown も DOM に存在するため、warehouse 名や status ラベルは「filter にも現れる文字」を狙うと衝突する。**コード列 (W-001) や override 用ユニーク値**で assert する
- `vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))` の spy を `expect` で参照したい時は **トップレベル変数を再利用せず**、`import toast from 'react-hot-toast'` 経由で `toast.error` を直接 assert する（vi.mock factory は hoist されるため variable references が壊れる）
