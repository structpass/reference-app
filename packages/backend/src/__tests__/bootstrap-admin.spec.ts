import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('prisma/bootstrap-admin.mjs — 本番初期管理者 bootstrap（ref-0086）', () => {
  const SCRIPT = resolve(__dirname, '../../prisma/bootstrap-admin.mjs');

  it('SUB 未設定時は明示メッセージで skip 終了する（dev / 既存本番を壊さない）', () => {
    // plain Node で実行（ts-node 非依存＝pnpm install --prod 後の本番イメージで動くことを実証）。
    const output = execFileSync('node', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, BOOTSTRAP_ADMIN_SUB: '', BOOTSTRAP_ADMIN_EMAIL: '' },
    });
    expect(output).toContain('スキップ');
  });

  it('SUB あり・EMAIL なしは exit 1 で明示エラー（SUB 指定時は EMAIL 必須）', () => {
    let status = 0;
    try {
      execFileSync('node', [SCRIPT], {
        encoding: 'utf8',
        env: { ...process.env, BOOTSTRAP_ADMIN_SUB: 'sub-1', BOOTSTRAP_ADMIN_EMAIL: '' },
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
    }
    expect(status).toBe(1);
  });

  it('注入テスト（昇格 / 冪等 / 作成 / P2002 / TOCTOU フォールバック / 不一致警告）が全て通る', () => {
    // backend の jest は CJS（moduleFileExtensions に mjs 無し）のため ESM の bootstrapAdmin を
    // spec から直接 import できない。plain Node のハーネスがスタブ prisma を注入して各ケースを
    // 実行し、JSON を返す（ハーネス実行自体が「--prod イメージで動く」前提の実証も兼ねる）。
    const HARNESS = resolve(__dirname, 'bootstrap-admin.harness.mjs');
    const output = execFileSync('node', [HARNESS], { encoding: 'utf8', stdio: 'pipe' });
    const results: { name: string; pass: boolean; detail?: string }[] = JSON.parse(
      output.trim().split('\n').pop() as string,
    );
    expect(results.map((r) => r.name)).toEqual([
      'existing-pending-promote',
      'already-admin-noop',
      'create-first',
      'p2002-explicit-error',
      'p2002-toctou-fallback-promote',
      'email-mismatch-warning-masked',
    ]);
    for (const r of results) {
      expect(`${r.name}: ${r.detail ?? 'ok'}`).toBe(`${r.name}: ok`);
      expect(r.pass).toBe(true);
    }
  });
});
