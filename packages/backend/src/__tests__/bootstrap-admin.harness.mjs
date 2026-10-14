#!/usr/bin/env node
/**
 * bootstrap-admin.mjs の注入テストハーネス（ref-0086）。
 *
 * backend の jest は CJS（ts-jest・moduleFileExtensions に mjs 無し）のため、ESM の
 * bootstrap-admin.mjs を spec から直接 import できない。そこで plain Node（ESM）で
 * bootstrapAdmin をスタブ prisma 注入で実行し、結果を JSON で stdout へ返す。
 * spec（bootstrap-admin.spec.ts）が本ハーネスを subprocess 実行して各ケースを assert する。
 * これは「plain Node で動く」という本番前提（pnpm install --prod・ts-node 非依存）の実証も兼ねる。
 */
import { bootstrapAdmin } from '../../prisma/bootstrap-admin.mjs';

/**
 * 呼び出し記録付きのスタブ prisma を作る。
 * existingSeq: findUnique が呼び出し順に返す値の列（末尾を繰り返す）。TOCTOU フォールバックの
 * 「1 回目不在 → P2002 → 2 回目で JIT 作成済みが見つかる」を再現するため列で受ける。
 */
function stubPrisma({ existingSeq = [null], createError = null } = {}) {
  const calls = { update: [], create: [], findUnique: 0 };
  return {
    calls,
    user: {
      findUnique: async () => {
        const i = Math.min(calls.findUnique, existingSeq.length - 1);
        calls.findUnique += 1;
        return existingSeq[i];
      },
      update: async (args) => {
        calls.update.push(args);
        return args.data;
      },
      create: async (args) => {
        if (createError) throw createError;
        calls.create.push(args);
        return { id: 'u-new', ...args.data };
      },
    },
  };
}

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, detail: e?.message ?? String(e) });
  }
}
function assert(cond, detail) {
  if (!cond) throw new Error(detail);
}

// 1. SSO 先行（JIT 承認待ち: role null / isActive false）→ 昇格のみ・email/name 非上書き
await run('existing-pending-promote', async () => {
  const prisma = stubPrisma({
    existingSeq: [
      {
        id: 'u1',
        oidcSub: 's1',
        email: 'claim@example.com',
        name: 'C',
        role: null,
        isActive: false,
      },
    ],
  });
  const msg = await bootstrapAdmin({ prisma, sub: 's1', email: 'boot@example.com', name: 'B' });
  assert(prisma.calls.update.length === 1, 'update が 1 回呼ばれること');
  const data = prisma.calls.update[0].data;
  assert(data.role === 'SYS_ADMIN' && data.isActive === true, '昇格データが role/isActive のみ');
  assert(!('email' in data) && !('name' in data), 'email/name を上書きしないこと');
  assert(prisma.calls.create.length === 0, 'create は呼ばれないこと');
  assert(/昇格/.test(msg), `昇格メッセージ: ${msg}`);
});

// 2. 既に SYS_ADMIN・有効 → 変更なし（冪等・毎デプロイ再実行に耐える）
await run('already-admin-noop', async () => {
  const prisma = stubPrisma({
    existingSeq: [
      {
        id: 'u1',
        oidcSub: 's1',
        email: 'boot@example.com',
        name: 'B',
        role: 'SYS_ADMIN',
        isActive: true,
      },
    ],
  });
  const msg = await bootstrapAdmin({ prisma, sub: 's1', email: 'boot@example.com' });
  assert(
    prisma.calls.update.length === 0 && prisma.calls.create.length === 0,
    '書き込みゼロ（冪等）',
  );
  assert(/変更なし/.test(msg), `変更なしメッセージ: ${msg}`);
});

// 3. bootstrap 先行（未作成）→ SYS_ADMIN・有効で事前作成（NAME 空文字は email 流用）
await run('create-first', async () => {
  const prisma = stubPrisma();
  await bootstrapAdmin({ prisma, sub: 's1', email: 'boot@example.com', name: '' });
  assert(prisma.calls.create.length === 1, 'create が 1 回呼ばれること');
  const data = prisma.calls.create[0].data;
  assert(
    data.oidcSub === 's1' && data.role === 'SYS_ADMIN' && data.isActive === true,
    '作成データ',
  );
  assert(data.name === 'boot@example.com', 'NAME 空文字（compose 既定）で email を流用すること');
});

// 4. email 一意衝突（P2002）→ 原因の分かる明示エラー
await run('p2002-explicit-error', async () => {
  const prisma = stubPrisma({ createError: Object.assign(new Error('unique'), { code: 'P2002' }) });
  let threw = null;
  try {
    await bootstrapAdmin({ prisma, sub: 's1', email: 'dup@example.com' });
  } catch (e) {
    threw = e;
  }
  assert(
    threw && /P2002/.test(threw.message) && /BOOTSTRAP_ADMIN_EMAIL/.test(threw.message),
    'P2002 明示エラー',
  );
});

// 5. TOCTOU: findUnique 不在 → create が P2002（SSO JIT が同 sub で先に作成）→ 再取得で昇格へ
//    フォールバックし、「email を変えろ」の誤誘導エラーにしないこと（database-reviewer MEDIUM）。
await run('p2002-toctou-fallback-promote', async () => {
  const jitUser = {
    id: 'u2',
    oidcSub: 's1',
    email: 'claim@example.com',
    name: 'C',
    role: null,
    isActive: false,
  };
  const prisma = stubPrisma({
    existingSeq: [null, jitUser],
    createError: Object.assign(new Error('unique'), { code: 'P2002' }),
  });
  const msg = await bootstrapAdmin({ prisma, sub: 's1', email: 'boot@example.com' });
  assert(prisma.calls.findUnique === 2, 'P2002 後に sub で再取得すること');
  assert(prisma.calls.update.length === 1, '昇格経路へフォールバックすること');
  assert(/昇格/.test(msg), `昇格メッセージ: ${msg}`);
});

// 6. SUB の指し先の email が env と不一致 → 昇格は継続しつつマスク付き警告を出す
//    （無関係ユーザーの静かな昇格を検知可能にする・security-reviewer MEDIUM / LOW）。
await run('email-mismatch-warning-masked', async () => {
  const prisma = stubPrisma({
    existingSeq: [
      {
        id: 'u1',
        oidcSub: 's1',
        email: 'other@example.com',
        name: 'O',
        role: null,
        isActive: false,
      },
    ],
  });
  const msg = await bootstrapAdmin({ prisma, sub: 's1', email: 'boot@example.com' });
  assert(/警告/.test(msg), `警告が含まれること: ${msg}`);
  assert(msg.includes('o***@example.com'), `実 email はマスク表示されること: ${msg}`);
  assert(!msg.includes('other@example.com'), `実 email の生表示が無いこと: ${msg}`);
});

console.log(JSON.stringify(results));
if (results.some((r) => !r.pass)) process.exit(1);
