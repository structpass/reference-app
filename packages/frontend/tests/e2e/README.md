# UI Verification — Lv1 (URL 列挙) / Lv2 (Excel シナリオ)

auth 必須ページの UI 検証を Playwright で自動化するための雛形群。
判定は vision LLM judgment（`ui-review-runner` agent / 手動レビュー）または DOM assertion で行う。

## 階層構成

| 階層    | 用途                                      | 入力形式              | scripts                               |
| ------- | ----------------------------------------- | --------------------- | ------------------------------------- |
| **Lv1** | URL 列挙のみ（role × page の差分撮影）    | ハードコード scenario | `capture-all.mjs` / `flash-check.mjs` |
| **Lv2** | 業務シナリオ（form 操作含む状態遷移検証） | Excel `.xlsx`         | `run-scenario.mjs`                    |

発火条件:

- **Lv1**: 1〜数枚のスクショで十分なケース、特殊な regression（flash-check 等）
- **Lv2**: **開発エージェントが動作確認依頼で項目 2 件以上**を開発統括に出す時、自動で「シナリオ化しますか?」を提案 → 開発統括 yes で起動。spec: `docs/discover/specs/2026-05-12-ui-scenario-testing-design.md`

## Lv1: 2 つの script の使い分け

| script            | 用途                                                             | throttle           | login 回数             |
| ----------------- | ---------------------------------------------------------------- | ------------------ | ---------------------- |
| `capture-all.mjs` | 通常 UI 検証（role × page の差分撮影）                           | なし               | role 別に 1 回         |
| `flash-check.mjs` | FeatureGuard v2/v3 の **permission flash regression**（B/C/D/E） | WH_USER は slow 3G | 2（whuser + sysadmin） |

`flash-check.mjs` の対象シナリオは script 冒頭コメント参照。E 用 product UUID は実行時に `/api/v1/products?limit=1` から動的取得する（seed 順序に依存しない）。

## 使う条件（全て満たすときだけ）

1. **auth guard 越え**が必要なページ（未ログイン → /login リダイレクト）
2. **役割別 / 状態別の差分が 3 シナリオ以上**（手動往復が辛い規模）
3. **form 自体は検証対象外**（login form の挙動を見たい場合はこの経路では検証にならない）
4. **cookie が `sameSite: 'Lax'` 以下** で発行されている（Strict + HttpOnly + Secure 厳格化時は別経路が必要）

## 使わない場面

| ケース                                               | 代わりに使うもの                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| public ページの単発 UI 確認                          | `ui-iterate` skill（screenshot-runner 単体）                      |
| form 自体の挙動検証（login/登録/検索 form の input） | `e2e-runner` agent（form-fill 経路で React Hook Form 対応を組む） |
| component 単位の DOM 挙動                            | Vitest + Testing Library                                          |
| API レベルの整合性                                   | curl / supertest                                                  |

## 前提セットアップ

1. **UI test 用ユーザー作成**（一度だけ）:

   ```
   corepack pnpm --filter @struct-pass/backend exec ts-node scripts/create-ui-test-users.ts
   ```

   `ui-test-sysadmin` (SYS_ADMIN) と `ui-test-whuser` (WH_USER) を upsert する。password は `UiTest1234!`。

2. **frontend (3000) + backend (3001) が起動済み**であること（`pnpm dev`）

3. **Throttle 注意**: backend は login を 5 req / 15 min / IP で制限。試行錯誤で枯渇したら backend 再起動で in-memory store をリセットする。

## 実行

```
node packages/frontend/tests/e2e/capture-all.mjs    # 通常 UI 検証
node packages/frontend/tests/e2e/flash-check.mjs    # FeatureGuard B/C/D/E regression
```

出力先: `tmp/ui-test/{scenario}-*.png`（gitignore 対象）

環境変数で URL 上書き可:

- `UI_TEST_BACKEND`（default `http://localhost:3001`）
- `UI_TEST_FRONTEND`（default `http://localhost:3000`）

## 他ページに流用する手順

1. このファイルをコピー（例: `capture-orders.mjs`）
2. `// --- scenarios ---` ブロックの `withRole(...)` 呼び出しと `snap(...)` の URL / 出力名を書き換え
3. 新しい role が必要なら `scripts/create-ui-test-users.ts` にエントリ追加 → 再実行

## 認証経路の補足

login form を Playwright `fill()` / `pressSequentially()` で埋めても **React Hook Form の `onSubmit` が発火しない**事象を確認済。回避策として:

- `request.newContext().post('/api/v1/auth/login')` で API 直接 login → JWT cookie 取得
- `context.addCookies()` で browser に注入
- 認証済みの状態で `goto()` する

この経路は **form の挙動を検証しない**前提で成立する。form 自体を検証したい場合は別アプローチが必要。

## Playwright import の注意

現状 `@playwright/test` を frontend devDependencies に追加済みのため、Node の bare specifier resolution で `import { chromium, request } from '@playwright/test'` が repo root からの実行でも解決される。`lib/auth-helpers.mjs` がこの経路を使用。

---

## Lv2: Excel 駆動シナリオ runner

業務シナリオ（form 操作・状態遷移検証）を Excel で管理し、Playwright で自動実行する。

### 工程

1. 開発エージェント↔ 開発統括で対話、シナリオ概要を詰める（自然言語）
2. 開発エージェントが `.xlsx` を生成: `packages/frontend/tests/e2e/scenarios/<topic>-YYYY-MM-DD.xlsx`
3. 開発統括レビュー → 開発エージェント修正 → 合意
4. 開発エージェントが runner で実行 → 結果が Excel に書き戻される

### 実行

```
node packages/frontend/tests/e2e/run-scenario.mjs <xlsx-path>
```

例:

```
node packages/frontend/tests/e2e/run-scenario.mjs packages/frontend/tests/e2e/scenarios/csv-import-2026-05-20.xlsx
```

### Excel スキーマ（`scenarios` シート、1 行 = 1 step）

| 列           | 例                                   | 説明                                               |
| ------------ | ------------------------------------ | -------------------------------------------------- |
| scenarioId   | TC-001                               | 主キー                                             |
| scenarioName | ナビゲーション遷移                   | 人間用ラベル                                       |
| patternId    | TC-001-01                            | 同シナリオ内の分岐識別                             |
| patternName  | サイドバーから遷移                   | 分岐の意味                                         |
| precondRole  | SYS_ADMIN                            | 認証 role                                          |
| precondData  | ログイン済み（file-import 権限あり） | 手動準備の前提（実行には影響しない、開発統括メモ） |
| stepNo       | 1, 2, 3                              | 操作順序                                           |
| operation    | `goto: /dashboard/imports`           | Cell DSL（下記）                                   |
| expected     | `expectVisible: h1`                  | Cell DSL（下記）                                   |
| judgeMethod  | `dom` / `vision` / `both`            | 判定方法                                           |
| result       | `OK` / `NG` / `pending` / `skip`     | 実行後 runner が書き込む                           |
| evidence     | スクショパス or エラーメッセージ     | 実行後 runner が書き込む                           |
| note         | 開発統括メモ                         | runner は読まない                                  |

実行後、`results` シートが自動生成され、サマリ（timestamp / total / OK / NG / pending / skip）が記録される。

### Cell DSL（operation / expected 列）

operation 列の verb:

- `goto: <url-path>` — frontend 相対 path or 絶対 URL。`goto: /dashboard`
- `click: <selector>` — Playwright locator 構文。`click: a[href="/dashboard/imports"]`
- `fill: <selector> = <value>` — React Hook Form 対応 3 段階 fallback。`fill: input[name="title"] = "テスト"` / 値の quote は省略可
- `waitFor: <selector>` — 要素表示まで待機

expected 列の verb:

- `expectVisible: <selector>` — 要素存在 + visible
- `expectHidden: <selector>` — 要素が **DOM に存在する前提**で visible=false を要求（selector typo を検知）
- `expectAbsent: <selector>` — 要素が DOM に**存在しない**ことを要求（条件レンダリングで非描画のケース用）
- `expectText: <selector> = <text>` — 部分一致
- `expectCount: <selector> = <n>` — 要素数の完全一致
- `expectUrl: <substring>` — `page.url()` に含まれるか（5 秒待機付き、Next.js Link 遷移後の判定に使う）

`expectHidden` と `expectAbsent` の使い分け:

- 「ボタンが描画はされるが disabled / `display:none` で見えない」→ `expectHidden`
- 「権限がないので `{canManage && <button>...}` 等で DOM 自体に描画されない」→ `expectAbsent`

`judge=both` で DOM が pass した後、screenshot 取得が失敗した場合は `evidence` 列に `(screenshot failed: ...)` を残しつつ `result=OK` を維持する（screenshot 副作用で judge 結果を上書きしない）。

複数 verb は `;` で連結可:

```
expectVisible: h1:has-text("ファイル取込"); expectAbsent: button:has-text("エラー CSV ダウンロード")
```

### judgeMethod

- `dom` — DOM assertion のみ。高速・確実
- `vision` — DOM 判定スキップ、各 step でスクショを撮って `tmp/ui-test/` に保存、結果は `pending`。開発エージェントが後で `ui-review-runner` で判定する用途
- `both` — DOM 判定 + スクショ両方。dom 失敗で NG、成功で OK + evidence にスクショパス記録

### throttle 回避

backend login throttle (5 req / 15 min / IP) を消費しないよう、runner は **role でグルーピングして 1 login** で複数 pattern を捌く。WH_USER に 4 patterns 並んでも login は 1 回。

### 過去シナリオの参考実装

- `scenarios/csv-import-2026-05-20.xlsx` — CSV 取込機能の確認シナリオ（6 シナリオ / 7 pattern / 18 step: ナビゲーション・取込対象セレクタ・テンプレ DL・ドライラン・取込実行（冪等）・エラーテーブル）
- 生成スクリプト: `scenarios/_gen-csv-import.mjs`（一度限り、流用時はコピーして書き換え）
