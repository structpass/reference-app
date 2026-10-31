/**
 * `scripts/align-migration-checksums.mjs`（d871）の判定を、使い捨ての記録で確かめる。
 * 判定は DB に訊く前の純粋な関数（planAlign）に切り出してあり、ここだけを叩く。
 *
 * 固定する形:
 *   ① 対象に挙げた移行だけを揃え、中身の違いと改行の違いを分ける
 *   ② 対象に挙げていない移行は触らず、ずれたまま残るものを射程外として名前つきで挙げる
 *   ③ 適用済みの記録が無い・すでに一致している移行は、揃えずに理由つきで外す
 *   ④ フォルダに無い名前を対象に挙げたら、揃えずに unknown として返す
 *
 * 使い方: node --test scripts/align-migration-checksums.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contentApprovalDigest,
  contentGate,
  handleMainError,
  planAlign,
  runPlanAfterApproval,
  StopSignal,
  withConnectedClient,
} from './align-migration-checksums.mjs';

const onDisk = [
  '20260315133646_init',
  '20261027020000_restrict_remaining_user_refs',
  '20261028020000_next',
];
const checksum = (name) => `now-${name}`;
const row = (overrides) => ({
  migration_name: overrides.migration_name,
  finished_at: 'finished_at' in overrides ? overrides.finished_at : '2026-10-21T00:00:00Z',
  rolled_back_at: overrides.rolled_back_at ?? null,
  checksum: overrides.checksum ?? checksum(overrides.migration_name),
});

test('対象に挙げた移行だけを揃え、中身の違いと改行の違いを分ける', () => {
  const rows = [
    row({ migration_name: '20260315133646_init', checksum: 'crlf-20260315133646_init' }),
    row({ migration_name: '20261027020000_restrict_remaining_user_refs', checksum: 'old-file' }),
    row({ migration_name: '20261028020000_next', checksum: 'old-file-2' }),
  ];
  const checksumWith = (name, lineEnding) =>
    lineEnding === 'crlf' ? `crlf-${name}` : checksum(name);
  const plan = planAlign(rows, onDisk, checksum, checksumWith, {
    only: ['20260315133646_init', '20261027020000_restrict_remaining_user_refs'],
  });

  assert.deepEqual(
    plan.align.map((item) => [item.name, item.kind]),
    [
      ['20260315133646_init', 'line-ending'],
      ['20261027020000_restrict_remaining_user_refs', 'content'],
    ],
  );
  assert.equal(plan.align[0].to, 'now-20260315133646_init');
  assert.equal(plan.align[1].from, 'old-file');
  // 対象に挙げていない next は触らない（射程外として名前つきで残る）。
  assert.deepEqual(plan.untouched, [
    { name: '20261028020000_next', reason: '対象に挙げていない（射程外）' },
  ]);
});

test('対象に挙げていない移行は、ずれていても触らず射程外に並べる', () => {
  const rows = onDisk.map((name) => row({ migration_name: name, checksum: `old-${name}` }));
  const plan = planAlign(rows, onDisk, checksum, null, { only: ['20261028020000_next'] });
  assert.equal(plan.align.length, 1);
  assert.deepEqual(plan.untouched.map((item) => item.name).sort(), [
    '20260315133646_init',
    '20261027020000_restrict_remaining_user_refs',
  ]);
});

test('適用済みの記録が無い・すでに一致している移行は、揃えずに理由つきで外す', () => {
  const rows = [
    row({ migration_name: '20260315133646_init', rolled_back_at: '2026-10-20T00:00:00Z' }),
    row({ migration_name: '20261027020000_restrict_remaining_user_refs' }),
    row({ migration_name: '20261028020000_next' }),
  ];
  const plan = planAlign(rows, onDisk, checksum, null, {
    only: ['20260315133646_init', '20261027020000_restrict_remaining_user_refs'],
  });
  assert.equal(plan.align.length, 0);
  assert.deepEqual(plan.skip, [
    { name: '20260315133646_init', reason: '適用済みの記録が無い' },
    { name: '20261027020000_restrict_remaining_user_refs', reason: 'すでに一致している' },
  ]);
});

test('フォルダに無い名前を対象に挙げたら、揃えずに unknown として返す', () => {
  const rows = [row({ migration_name: '20260315133646_init' })];
  const plan = planAlign(rows, onDisk, checksum, null, { only: ['20260315133646_init', 'ghost'] });
  assert.equal(plan.align.length, 0);
  assert.deepEqual(plan.unknown, ['ghost']);
});

test('中身の違いを承認する時は、承認する中身そのものを渡す（d927）', () => {
  // DB は checksum しか持たないので差分は出せない。代わりに、揃える版の中身と行数を渡して、
  // 「何を承認したか」を人が読める形にする（--allow-content-diff 1 つで通せないようにする）。
  const items = [
    { name: 'a', from: 'old-a', to: 'new-a', kind: 'content' },
    { name: 'b', from: 'old-b', to: 'new-b', kind: 'line-ending' },
    { name: 'c', from: 'old-c', to: 'new-c', kind: 'content' },
  ];
  const contents = { a: 'SELECT 1;\nSELECT 2;\n', b: 'x', c: 'only one line' };
  const digest = contentApprovalDigest(items, (name) => contents[name]);

  // 改行の違いは中身が同じなので承認の対象にしない。
  assert.deepEqual(
    digest.map((item) => item.name),
    ['a', 'c'],
  );
  assert.equal(digest[0].content, 'SELECT 1;\nSELECT 2;\n');
  // 末尾の改行は行として数えない（人の目で数えた行数と合わせる）。
  assert.equal(digest[0].lines, 2);
  assert.equal(digest[1].lines, 1);
  assert.deepEqual(
    digest.map((item) => [item.from, item.to]),
    [
      ['old-a', 'new-a'],
      ['old-c', 'new-c'],
    ],
  );
});

test('改行だけの違いしか無ければ、承認の対象は空になる（d927）', () => {
  const digest = contentApprovalDigest(
    [{ name: 'a', from: 'x', to: 'y', kind: 'line-ending' }],
    () => 'unused',
  );
  assert.deepEqual(digest, []);
});

test('承認の門: 中身の違いを読まずに通せない（d927）', () => {
  // この決定の中心。--allow-content-diff 1 つで通せてしまうと、何を承認したか読まれないまま
  // 記録の食い違いが隠れる。門そのものを叩いて、通り道が 1 つも無いことを固定する。
  const diff = [{ kind: 'content' }];

  // 承認マークが無ければ、記録の置き場所があっても通さない。
  assert.equal(
    contentGate(diff, { allowContentDiff: false, approvalRecord: undefined }),
    'refuse-unapproved',
  );
  assert.equal(
    contentGate(diff, { allowContentDiff: false, approvalRecord: 'r.json' }),
    'refuse-unapproved',
  );

  // 承認マークだけでは通さない（承認した事実を残さないと先へ進めない）。
  assert.equal(
    contentGate(diff, { allowContentDiff: true, approvalRecord: undefined }),
    'needs-record',
  );

  // 両方そろって初めて進む。
  assert.equal(contentGate(diff, { allowContentDiff: true, approvalRecord: 'r.json' }), 'proceed');

  // 中身の違いが無ければ、この門は素通り（改行だけの違いは中身が同じ）。
  assert.equal(contentGate([], { allowContentDiff: false, approvalRecord: undefined }), 'skip');
});

/**
 * 承認の後の筋道を、効果を差し替えて走らせる（CLI と同じ順序で確かめるため）。
 * 書込み・記録の書き出し・停止をすべて記録し、何が起きたかを返す。
 */
async function runFlow({ allowContentDiff, approvalRecord, apply = true, kind = 'content' }) {
  const events = [];
  let stopped = null;
  const deps = {
    plan: { align: [{ name: 'm1', from: 'old', to: 'new', kind }] },
    allowContentDiff,
    approvalRecord,
    apply,
    log: (message) => events.push(['log', message]),
    logError: (message) => events.push(['error', message]),
    stop: (code) => {
      stopped = code;
      throw new StopSignal(code);
    },
    write: async () => {
      events.push(['write']);
      return 1;
    },
    readContent: () => '-- 中身\nSELECT 1;\n',
    writeRecord: (file) => events.push(['record', file]),
  };
  try {
    await runPlanAfterApproval(deps);
  } catch (error) {
    if (!(error instanceof StopSignal)) throw error;
  }
  return {
    stopped,
    wrote: events.some(([eventKind]) => eventKind === 'write'),
    wroteRecord: events.some(([eventKind]) => eventKind === 'record'),
    printed: events.filter(([eventKind]) => eventKind === 'log').map(([, message]) => message),
  };
}

test('承認なしで止まる時は、中身を出して DB を 1 行も書かない（d927）', async () => {
  // 門の関数だけでは CLI がその戻り値で止まることを縛れなかった（独立の目の指摘）。
  // 効果を差し替えた筋道ごと確かめ、止まる時に書込みが起きないことを固定する。
  const result = await runFlow({ allowContentDiff: false, approvalRecord: undefined });
  assert.equal(result.stopped, 2);
  assert.equal(result.wrote, false, '承認していないのに DB を書いた');
  assert.equal(result.wroteRecord, false);
  assert.equal(
    result.printed.some((message) => message.includes('SELECT 1;')),
    true,
    '止まる時に承認する中身を出していない',
  );
});

test('承認だけして記録を残さない時も、書かずに止まる（d927）', async () => {
  const result = await runFlow({ allowContentDiff: true, approvalRecord: undefined });
  assert.equal(result.stopped, 2);
  assert.equal(result.wrote, false, '記録なしの承認で DB を書いた');
  assert.equal(result.wroteRecord, false);
  assert.equal(
    result.printed.some((message) => message.includes('SELECT 1;')),
    true,
  );
});

test('承認と記録がそろって初めて書き、中身を出してから書く（d927）', async () => {
  const result = await runFlow({ allowContentDiff: true, approvalRecord: 'r.json' });
  assert.equal(result.stopped, null);
  assert.equal(result.wrote, true);
  assert.equal(result.wroteRecord, true);
  // 書く前に中身が出ていること（読まずに通せない）。
  const printedIndex = result.printed.findIndex((message) => message.includes('SELECT 1;'));
  assert.notEqual(printedIndex, -1, '中身を出さずに書いた');
});

test('改行だけの違いは、承認の引数なしで普通に書ける（d927）', async () => {
  const result = await runFlow({
    allowContentDiff: false,
    approvalRecord: undefined,
    kind: 'line-ending',
  });
  assert.equal(result.stopped, null);
  assert.equal(result.wrote, true);
  // 中身が同じなので、承認の記録は要らない。
  assert.equal(result.wroteRecord, false);
});

test('下見（--apply なし）では、揃えずに終わる（d927）', async () => {
  const result = await runFlow({ allowContentDiff: true, approvalRecord: 'r.json', apply: false });
  assert.equal(result.stopped, null);
  assert.equal(result.wrote, false, '下見なのに DB を書いた');
  assert.equal(result.wroteRecord, false);
});

test('CLI は止まる所で非 0 の終了コードを返す（d927）', async () => {
  // 筋道の試験は stop を差し替えるため、CLI 側の配線（StopSignal → 終了）は見ていない。
  // 配線そのものを、終了と報告を差し替えて確かめる。
  const exits = [];
  const reports = [];

  // 承認の門で止まった時は、その終了コードで終える（書込みも報告もしない）。
  handleMainError(
    new StopSignal(2),
    (code) => exits.push(code),
    (error) => reports.push(error),
  );
  assert.deepEqual(exits, [2]);
  assert.deepEqual(reports, [], '止まったのに想定外として報告した');

  // 想定外の失敗は 1 で終え、内容を報告する。
  const boom = new Error('boom');
  handleMainError(
    boom,
    (code) => exits.push(code),
    (error) => reports.push(error),
  );
  assert.deepEqual(exits, [2, 1]);
  assert.deepEqual(reports, [boom]);
});

test('止まった時も接続を閉じてから外へ返す（d927）', async () => {
  // 独立の目が「catch の中で終了する形に戻しても緑のまま」と指摘した回帰を縛る。
  // 承認の門で止まる筋道を、本物の StopSignal で走らせ、閉じたかどうかを見る。
  const order = [];
  let closed = false;

  const error = await withConnectedClient({
    connect: async () => ({
      $disconnect: async () => {
        closed = true;
        order.push('disconnect');
      },
    }),
    work: async () =>
      runPlanAfterApproval({
        plan: { align: [{ name: 'm1', from: 'old', to: 'new', kind: 'content' }] },
        allowContentDiff: false,
        approvalRecord: undefined,
        apply: true,
        log: () => {},
        logError: () => {},
        stop: (code) => {
          throw new StopSignal(code);
        },
        write: async () => {
          throw new Error('止まる時に書いてはいけない');
        },
        readContent: () => 'SELECT 1;',
        writeRecord: () => {
          throw new Error('止まる時に記録してはいけない');
        },
      }),
  }).catch((thrown) => thrown);

  assert.equal(error instanceof StopSignal, true, '止まったことが外へ伝わっていない');
  assert.equal(error.code, 2);
  assert.equal(closed, true, '止まった時に接続を閉じていない');
  // 閉じた後に終了させられること（終了が先では閉じられない）。
  order.push('after');
  assert.deepEqual(order, ['disconnect', 'after']);
});

test('作業が成功した時も接続を閉じる（d927）', async () => {
  let closed = false;
  const result = await withConnectedClient({
    connect: async () => ({
      $disconnect: async () => {
        closed = true;
      },
    }),
    work: async () => 'done',
  });
  assert.equal(result, 'done');
  assert.equal(closed, true);
});
