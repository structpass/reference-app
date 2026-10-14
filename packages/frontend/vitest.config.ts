import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    exclude: ['node_modules', 'e2e/**'],
    // cmn-0262: テスト実行の時間軸を UTC へ固定する（rete cmn-0253 からの横展開＝時間軸ポリシーを揃える）。
    // 手元は JST・CI は UTC という差があると、日時を含む spec が「手元だけ緑」になる。
    // v2-301: **TZ はプロセス起動前に与える必要がある**。Windows の Node は起動後に
    // process.env.TZ を書き換えても Date のオフセットへ反映しないため、下の test.env だけでは
    // 手元（Windows）で効かない。実行スクリプト側が cross-env で TZ=UTC を渡す
    // （package.json の test / test:watch / test:cov）。下の env はスクリプトを経由しない起動
    // （エディタ拡張等）でも POSIX では効くため残している。
    // 置き場が setupFiles でなく config なのは評価順のため＝setupFiles はモジュール評価の場で、
    // ESM の import 巻き上げにより同ファイルの import が代入より先に走る。test.env は環境
    // セットアップ時に適用されるので、setup へ時刻軸を掴む依存が入っても壊れない。
    // **JST へ固定してはいけない**: 閲覧者ローカル表示と Asia/Tokyo 固定表示は JST 実行下で
    // 完全に一致し、実装がどちらへ差し替わっても spec が緑のままになる（rete fil-0111 の教訓）。
    env: {
      TZ: 'UTC',
    },
    // vitest 2/3 ともデフォルト pool は forks だが、forks では msw の XHR インターセプトが
    // 初回リクエストを取りこぼす症状を確認したため、threads を明示指定する（ref-0094）
    pool: 'threads',
    // coverage 実行時の並列負荷によるタイムアウトを吸収（ref-0094・vitest 3 化後の安定化）
    testTimeout: 15000,
    hookTimeout: 15000,
    // vitest 3 化後、デフォルト並列（=CPU 数・ローカル 8）で jsdom + msw の統合テストが
    // リソース競合でタイムアウトするため worker 数を固定（ref-0094・ローカル/CI とも安定化）
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      // vitest 4 で coverage.all は廃止された。未テストファイルを分母へ入れるかは include の指定で決まり、
      // include を書かなければテストが読み込んだファイルだけが分母になる（vitest 3 の all: false と同じ扱い）。
      // 分母をテストが読み込んだファイルに限定する意図は変えていない＝下記 ratchet 閾値が
      // 未テストファイル由来のカバレッジ変動（分母増で率を押し下げる方向）に左右されないようにする（ref-0094）
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'out/',
        '**/*.config.*',
        '**/*.d.ts',
        '**/types/**',
        'src/app/**',
        '**/index.ts',
        // 手動 E2E スクリプトは vitest の test 対象からは除外済み（test.exclude）だが
        // coverage 測定には残って 0% で分母に載り、閾値を偽装失敗させていた
        // （rev-quality 2026-07-31 TEST-H1: 除外漏れを解消）。
        // test.exclude は e2e/ と tests/e2e/ の両方を見るため、coverage 側も両方除外する
        // （e2e/ 側が漏れると helpers/auth.ts 等が 0% で分母に載る）。
        'e2e/**',
        'tests/e2e/**',
      ],
      // ratchet thresholds: 現状実測値の floor をロックし、回帰のみ CI で fail させる。新規テスト追加で値を上げていく。
      // （2026-10-10 v2-436: vitest 4 化。V8 カバレッジの remapping が v8-to-istanbul から AST ベースへ変わり、
      //   同一 commit・同じ 150 ファイル / 993 テストでも実測値が動いた:
      //     vitest 3.2.7  = statements 94.01 / branches 88.27 / functions 80.64 / lines 94.01
      //     vitest 4.1.11 = statements 86.43 / branches 82.42 / functions 82.86 / lines 87.62
      //   テストと対象は減っていない（計測方法の変更。4 系は coverage.ignoreEmptyLines も廃止された）。
      //   旧床は実測に対し最大 7pp の余白があったが、新床は実測の 0.4〜0.9pp 上へ置く＝水準は下げず、
      //   実測に対する余白を詰める。判断の理由と対案は docs/decisions の ADR を参照。
      //   測定点 = TZ=UTC・shared build 済みで `pnpm --filter @struct-pass/frontend test:cov`）
      thresholds: {
        lines: 87,
        functions: 82,
        branches: 82,
        statements: 86,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
