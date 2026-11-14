# UI Verification — Lv1 (URL 列挙) / Lv2 (Excel シナリオ)

auth 必須ページの UI 検証を Playwright で自動化するための雛形群。
判定は画像の独立レビューまたは DOM assertion で行う。

## 階層構成

| 階層    | 用途                                      | 入力形式              | scripts                               |
| ------- | ----------------------------------------- | --------------------- | ------------------------------------- |
| **Lv1** | URL 列挙のみ（role × page の差分撮影）    | ハードコード scenario | `capture-all.mjs` / `flash-check.mjs` |
| **Lv2** | 業務シナリオ（form 操作含む状態遷移検証） | Excel `.xlsx`         | `run-scenario.mjs`                    |

発火条件:

- **Lv1**: 1〜数枚のスクショで十分なケース、特殊な regression（flash-check 等）
- **Lv2**: **AI が動作確認依頼で項目 2 件以上**を開発統括に出す時、自動で「シナリオ化しますか?」を提案 → 開発統括 yes で起動。spec: `docs/discover/specs/2026-05-12-ui-scenario-testing-design.md`

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
4. **対象 role の有効な OIDC セッション**を保存済みである

## 使わない場面

| ケース                                               | 代わりに使うもの                             |
| ---------------------------------------------------- | -------------------------------------------- |
| public ページの単発 UI 確認                          | `ui-iterate` skill（screenshot-runner 単体） |
| form 自体の挙動検証（login/登録/検索 form の input） | ブラウザで入力・送信まで操作して検証する     |
| component 単位の DOM 挙動                            | Vitest + Testing Library                     |
| API レベルの整合性                                   | curl / supertest                             |

## 前提セットアップと実行

Reference は Rete を使う OIDC 認証です。撤去済みのパスワード login API は使用しません。
リポジトリ直下から実行します。依存をインストールし、Chromium を用意してください。

```powershell
pnpm --filter @struct-pass/frontend exec playwright install chromium
New-Item -ItemType Directory -Force tmp/ui-auth
pnpm --filter @struct-pass/frontend exec playwright codegen --save-storage=../../tmp/ui-auth/WH_USER.json http://localhost:3000
# Rete を経由して対象の WH_USER でログインし、Reference に戻ってからブラウザを閉じる。
# 同じ方法で SYS_ADMIN.json も SYS_ADMIN のログイン後に保存する。
$env:UI_TEST_AUTH_DIR = (Resolve-Path tmp/ui-auth).Path
pnpm --filter @struct-pass/frontend ui:capture
pnpm --filter @struct-pass/frontend ui:flash
# Excel は作業用コピーを使用（結果を同じファイルへ書き戻す）。相対パスの基準は frontend。
pnpm --filter @struct-pass/frontend ui:scenario ../../tmp/scenario.xlsx
```

先に Rete と Reference の frontend/backend を起動し、検証対象に必要なデータを用意します。
セッションファイルは認証情報を含むため、Git 対象外の `tmp/` にのみ置き、共有しません。
期限切れの場合は OIDC ログインから保存し直します。各ツールは `/api/v1/auth/me` を呼び、
指定 role と有効利用者であることを確かめてから操作します。Cookie の domain や SameSite は書き換えません。
独自 role も `<ROLE>.json` を同じディレクトリへ置けます。ログイン時と実行時で同じホスト名を使い、localhost と 127.0.0.1 を混在させないでください。

出力先は `tmp/ui-test/`（`UI_TEST_OUT_DIR` に絶対パスを指定して分離可能）。環境変数 `UI_TEST_BACKEND`（既定 `http://localhost:3001`）、
`UI_TEST_FRONTEND`（既定 `http://localhost:3000`）で接続先を変えられます。
撮影成功は画面の正しさを保証しません。Lv1 と flash の画像は別途確認し、
Lv2 の `pending` は未判定、`skip` は未実施として扱います。

## 継続して確かめる範囲

`pnpm --filter @struct-pass/frontend test:ui-tools` は、専用の仮 HTTP 画面と一時 Excel を使い、
実ブラウザでセッション保持・不正セッションの拒否・撮影・Excel の成功/失敗と終了コードを検査します。
CI の test ジョブもこれを実行し、入口と CI 配線を `check-ci-wiring.mjs` が確認します。
製品サーバー、IdP、業務 DB を使わないツール自身の回帰検査です。
実製品の画面・権限・業務シナリオが通った根拠にはできません。
実製品の Excel シナリオを CI で自動運用する仕組みは未提供です（既存設計の対象外）。

## 他ページへの流用

撮影対象の URL は capture-all.mjs の scenarios ブロックで指定します。追加 role は OIDC でログイン後に storageState を保存してください。ログイン画面自身の検証には保存済みセッションを使わず、OIDC の操作全体を確かめます。

## Lv2: Excel 駆動シナリオ runner

業務シナリオ（form 操作・状態遷移検証）を Excel で管理し、Playwright で自動実行する。

### 工程

1. AI ↔ 開発統括で対話、シナリオ概要を詰める（自然言語）
2. AI が `.xlsx` を生成: `packages/frontend/tests/e2e/scenarios/<topic>-YYYY-MM-DD.xlsx`
3. 開発統括レビュー → AI 修正 → 合意
4. AI が runner で実行 → 結果が Excel に書き戻される

### 実行

```
pnpm --filter @struct-pass/frontend ui:scenario <xlsx-path>
```

例:

```
pnpm --filter @struct-pass/frontend ui:scenario ../../tmp/scenario.xlsx
```

### Excel スキーマ（`scenarios` シート、1 行 = 1 step）

| 列           | 例                                   | 説明                                           |
| ------------ | ------------------------------------ | ---------------------------------------------- |
| scenarioId   | TC-001                               | 主キー                                         |
| scenarioName | ナビゲーション遷移                   | 人間用ラベル                                   |
| patternId    | TC-001-01                            | 同シナリオ内の分岐識別                         |
| patternName  | サイドバーから遷移                   | 分岐の意味                                     |
| precondRole  | SYS_ADMIN                            | 認証 role                                      |
| precondData  | ログイン済み（file-import 権限あり） | 手動準備の前提（実行には影響しない、開発統括メモ） |
| stepNo       | 1, 2, 3                              | 操作順序                                       |
| operation    | `goto: /dashboard/imports`           | Cell DSL（下記）                               |
| expected     | `expectVisible: h1`                  | Cell DSL（下記）                               |
| judgeMethod  | `dom` / `vision` / `both`            | 判定方法                                       |
| result       | `OK` / `NG` / `pending` / `skip`     | 実行後 runner が書き込む                       |
| evidence     | スクショパス or エラーメッセージ     | 実行後 runner が書き込む                       |
| note         | 開発統括メモ                             | runner は読まない                              |

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
- `vision` — DOM 判定スキップ、各 step でスクショを撮って `tmp/ui-test/` に保存、結果は `pending`。後で画像を独立レビューする用途
- `both` — DOM 判定 + スクショ両方。dom 失敗で NG、成功で OK + evidence にスクショパス記録

### role ごとのセッション

runner は role でグルーピングし、保存済み OIDC セッションを読み込んだ context で複数 pattern を実行します。

### 過去シナリオの参考実装

- `scenarios/csv-import-2026-05-20.xlsx` — CSV 取込機能の確認シナリオ（6 シナリオ / 7 pattern / 18 step: ナビゲーション・取込対象セレクタ・テンプレ DL・ドライラン・取込実行（冪等）・エラーテーブル）
- 生成スクリプト: `scenarios/_gen-csv-import.mjs`（一度限り、流用時はコピーして書き換え）
