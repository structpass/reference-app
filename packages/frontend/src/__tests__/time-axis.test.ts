import { describe, it, expect } from 'vitest';

// cmn-0262: テスト実行の時間軸が UTC で固定されていることを検査する（rete からの横展開）。
// vitest.config.ts の test.env.TZ を設定しただけで効いていない状態（Node が起動後の TZ 変更を
// 拾わない環境・設定の消失）を、緑のまま見逃さないための実効性チェック。日時を含む spec が
// 「手元 JST だけ緑・CI UTC で赤」になる経路をここで潰す。
// v2-301: TZ はプロセス起動前に与える必要がある。実行はパッケージのスクリプト（pnpm test /
// test:cov。cross-env で TZ=UTC を渡す）を使う。vitest を直接起動した時にこの 2 本目が赤に
// なるのは正しい挙動で、設定漏れ・実行方法のずれを検出している。
describe('テスト実行の時間軸', () => {
  it('TZ=UTC が設定されている', () => {
    expect(process.env.TZ).toBe('UTC');
  });

  it('設定が実際に効いている（ローカル時刻のオフセットが 0）', () => {
    expect(
      new Date().getTimezoneOffset(),
      'TZ はプロセス起動前に与える必要がある（pnpm test / test:cov で実行する）',
    ).toBe(0);
  });
});
