import { defineConfig } from '@playwright/test';

// 画面の E2E は e2e/ 配下の spec を全部、手元でも CI でも走らせる（d864）。
//
// 以前は CI だけ e2e/portal.spec.ts 1 本に絞っていた（d808）。残り 3 本
// （categories・product-category-dropdown・change-password）が SSO 化で撤去した
// ログイン入力・パスワード変更画面を前提にしていて CI では成立しなかったため。
// その 3 本は e2e/helpers/backend-stub.ts でログインの解決・権限の解決・API の差し替えを
// 1 箇所に寄せる形へ書き換えたので、CI でもこの 1 形で走る。
// 走らせる spec を環境変数で選ぶ口は置かない（CI と手元で集合がずれると、CI で緑のまま
// 手元だけ赤い差が出る）。scripts/check-ci-wiring.mjs が、CI が全部を見ていることを確かめる。

// 接続先は環境変数で差し替えられるようにする（既定は従来どおり手元の 3000）。
// 手元で別の dev サーバーが 3000 を握っている時や、壊れた .next を持ち直さずに検証したい時に、
// 使っているサーバーへ触らずに同じ試験を流せる（d808 の作業中に実際に必要になった）。
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
// 起動するサーバーのポートは接続先から導く（固定値にすると E2E_BASE_URL を変えても
// 3000 で起動し、既に 3000 を使っている環境では起動に失敗する）。
const PORT = new URL(BASE_URL).port || '80';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // 1 本の失敗で座礁しない形（d921）。開発サーバーを起動した直後は、最初の数本が
  // 開き直しの途中で中断して落ちる（実測: 全 13 件を 1 回で走らせて 8 件が aborted、
  // 同じ 2 本だけを後から絞れば緑）。手元では既定 0 回のため、その赤が毎回出ていた。
  // 手元は 1 本目だけ 1 回やり直し、詳細（trace）は既定で取らずに失敗した時だけ残す。
  // CI は従来どおり 2 回復帰試行する（retry が失敗を隠さない範囲に留める）。
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  // CI では失敗の内訳をジョブのログから読めるようにする（html のみだと手元で開き直す必要がある）。
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: 60000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
  },
  // 試験が自分でサーバーを起動する（CI で「起動していない相手を叩いて赤」を出さない）。
  //
  // CI は配布と同じ形（next build 済みの成果物を next start で配信）で見る。next dev では
  // middleware の CSP 分岐（開発は nonce を出さない）や NODE_ENV の分岐が本番と変わり、
  // 本番の挙動を確かめたことにならない。CI の e2e ジョブが build を済ませてから走らせる。
  // 手元は開発サーバー（next dev）で足りる＝起動に 1 分以上かからない。
  // 手元・CI とも、既に起動しているサーバー（reuseExistingServer）をそのまま使う。ただし CI は
  // 既定で起動済みのサーバーが無いため、下の分岐は常に自分で起動する。
  webServer: {
    command: process.env.CI ? `pnpm exec next start -p ${PORT}` : `pnpm exec next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
