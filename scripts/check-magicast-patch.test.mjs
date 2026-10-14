// magicast 0.5.5 に内蔵された source-map 実装の修復を検査する。
//
// 対象は「現行 main が実際に解決する magicast 0.5.5 の内蔵 bundle」だけ。
// v2-405 で検証済みの native patch（patches/magicast@0.5.5.patch）が当たっていることを
// バイト単位で確かめ、そのうえで実 API の拒否／正常の両方を実測する。
//
// 検査の柱（v2-405 の 7 つの門を保持する）:
//   1. 負値・小数・安全整数の範囲外を offset として拒否する
//   2. 単段の line offset 上限（1e7）を超える入力を拒否する
//   3. 入れ子の累積 line offset 上限を超える入力を拒否する（_maxOffsetLine）
//   4. 通常の flat / indexed / object / string の source map は期待どおり動く
//   5. 通常の AST 編集が壊れない
//   6. sections の順序違反・url フィールドを拒否する
//   7. 入れ子 consumer の sources getter を1回だけ読む
//
// 巨大 offset は**コンストラクタだけ**で評価する（mappings を実メモリへ展開しない）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyMagicastSource, verifyMagicastBytes } from './check-magicast-patch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = path.join(root, 'node_modules/.pnpm');

function copies(name) {
  return fs
    .readdirSync(store)
    .filter((entry) => entry.startsWith(name + '@'))
    .map((entry) => path.join(store, entry, 'node_modules', name))
    .filter((entry) => fs.existsSync(path.join(entry, 'package.json')));
}

const basic = {
  version: 3,
  sources: ['original.ts'],
  names: [],
  mappings: 'AAAA',
  sourcesContent: ['export default { enabled: true, count: 1 };\n'],
};
const indexed = (line, column = 0, map = basic) => ({
  version: 3,
  sections: [{ offset: { line, column }, map }],
});
const invalid = [
  indexed(10000001),
  indexed(6000000, 0, indexed(6000000)),
  ...[-1, 0.5, '2', Infinity, NaN, null, undefined, Number.MAX_SAFE_INTEGER + 1].flatMap(
    (value) => [
      { version: 3, sections: [{ offset: { line: value, column: 0 }, map: basic }] },
      { version: 3, sections: [{ offset: { line: 0, column: value }, map: basic }] },
    ],
  ),
];

const oldDefaultMappings =
  'AAAA,CAAC,CAAC,CAAC,CAAC,CAAC,EAAE,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,EAAE,EAAE,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,EAAE,CAAC,CAAC,CAAC,CAAC,EAAE,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC';
const oldFlatMappings =
  'AAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,IAAA,CAAA';
const oldColumnOffsetMappings =
  'IAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,EAAA,CAAA,CAAA,CAAA,CAAA,CAAA,IAAA,CAAA';

function consumerControls(Consumer) {
  for (const map of invalid)
    assert.throws(() => new Consumer(map), /Section offset|required argument/);
  for (const [map, generatedLine, generatedColumn] of [
    [basic, 1, 0],
    [indexed(0), 1, 0],
    [indexed(2, 0), 3, 0],
    [indexed(0, 3), 1, 3],
    [indexed(0, 0, indexed(0)), 1, 0],
  ]) {
    const consumer = new Consumer(map);
    assert.deepEqual(Array.from(consumer.sources), ['original.ts']);
    const records = [];
    consumer.eachMapping((mapping) => records.push(mapping));
    assert.equal(records.length, 1);
    assert.equal(records[0].generatedLine, generatedLine);
    assert.equal(records[0].generatedColumn, generatedColumn);
    assert.equal(records[0].originalLine, 1);
    assert.equal(records[0].originalColumn, 0);
  }
  // コンストラクタの境界だけを見る（1000万行の mappings は展開しない）。
  assert.doesNotThrow(() => new Consumer(indexed(10000000, Number.MAX_SAFE_INTEGER)));
  assert.throws(
    () =>
      new Consumer({
        version: 3,
        sections: [
          { offset: { line: 2, column: 0 }, map: basic },
          { offset: { line: 1, column: 0 }, map: basic },
        ],
      }),
    /ordered/,
  );
  assert.throws(
    () =>
      new Consumer({
        version: 3,
        sections: [{ offset: { line: 0, column: 0 }, url: 'fixture.invalid' }],
      }),
    /url field/,
  );
  // 入れ子 consumer の sources getter は1回だけ読む（複数回読む実装に戻っていないこと）。
  const nested = new Consumer(indexed(0, 0, indexed(0)));
  const child = nested._sections[0].consumer;
  let reads = 0;
  Object.defineProperty(child, 'sources', {
    get() {
      reads++;
      return ['first.ts', 'second.ts', 'third.ts'];
    },
  });
  assert.deepEqual(Array.from(nested.sources), ['first.ts', 'second.ts', 'third.ts']);
  assert.equal(reads, 1, '入れ子の sources getter は1回だけ読む');
}

// 検査対象は「実際に解決される」magicast 0.5.5 だけにする。pnpm のストアには過去の
// install が残した未 patch の実体が同居しうるが、それは依存グラフから辿られない限り
// 消費者へ届かない。届く経路（リンク）を実際に辿って対象を決める。
const magicastCopies = copies('magicast').filter(
  (directory) =>
    JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version === '0.5.5',
);
const patchedCopies = magicastCopies.filter((d) => d.includes('patch_hash='));

test('patch が登録され、実際に解決する magicast 0.5.5 が検査対象に入っている', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(
    manifest.pnpm.patchedDependencies['magicast@0.5.5'],
    'patches/magicast@0.5.5.patch',
    'pnpm.patchedDependencies に magicast@0.5.5 を登録する',
  );
  assert(
    magicastCopies.length > 0,
    '実際に解決する magicast 0.5.5 が node_modules に無い（install してから検査する）',
  );
  assert.equal(patchedCopies.length, 1, 'patch 済みの解決先がただ1つ要る');
  assert(fs.existsSync(path.join(root, 'patches/magicast@0.5.5.patch')), 'patch の実体が要る');
});

// 依存グラフの実体を辿り、消費者が patch 済みの解決先を指していることを確かめる。
test('依存グラフ上の消費者が patch 済みの解決先を指している（未 patch へ落ちていない）', () => {
  const patchedDir = patchedCopies[0];
  assert(patchedDir, 'patch 済みの解決先が要る');
  const consumers = [];
  for (const entry of fs.readdirSync(store)) {
    const nm = path.join(store, entry, 'node_modules');
    const direct = path.join(nm, 'magicast');
    if (fs.existsSync(direct)) consumers.push({ entry, link: direct });
    const scopedRoot = path.join(nm, '@vitest');
    if (fs.existsSync(scopedRoot)) {
      for (const pkg of fs.readdirSync(scopedRoot)) {
        const inner = path.join(scopedRoot, pkg, 'node_modules', 'magicast');
        if (fs.existsSync(inner)) consumers.push({ entry, link: inner });
      }
    }
  }
  assert(consumers.length > 0, 'magicast を解決する消費者が見つからない');
  // 対象は magicast 0.5.5 を解決する経路だけ。0.3.5 を解決する経路（Prisma 系）は
  // 別の版であり、この patch の対象ではない。
  // 自分自身のストア実体（`magicast@0.5.5/node_modules/magicast`）は消費者ではないので除く。
  let checked = 0;
  for (const { entry, link } of consumers) {
    if (entry.startsWith('magicast@')) continue;
    const resolved = fs.realpathSync(link).replace(/\\/g, '/');
    if (!resolved.includes('magicast@0.5.5')) continue;
    checked++;
    assert(
      resolved.includes('patch_hash='),
      `消費者 ${entry} が未 patch の magicast 0.5.5 を指している: ${resolved}`,
    );
  }
  assert(checked > 0, 'magicast 0.5.5 を解決する消費者が見つからない');
  // 対象 consumer（@vitest/coverage-v8）が確かに含まれること。
  assert(
    consumers.some((c) => c.entry.includes('coverage-v8')),
    '@vitest/coverage-v8 が magicast を解決していない（consumer 回帰の対象が消えた）',
  );
});

// 検査は「依存グラフが実際に解決する patch 済みの実体」に対して行う。
// （ストアに残った未 patch の実体は誰にも解決されないため対象外。上の解決先検査で
//  未 patch へ落ちていないことは別途押さえている。）
for (const directory of patchedCopies) {
  const source = path.join(directory, 'dist/builders-CDdrUKLb.js');
  const label = path.basename(path.dirname(path.dirname(directory)));

  test('内蔵 bundle が検証済みの修復版と完全一致する: ' + label, () => {
    // 7 つの門を含む patch 後の完全な blob と一致すること（未修復・別物はここで落ちる）。
    verifyMagicastSource(source);
    // 1 バイトでも違えば落ちること（検査そのものが効いていることの確認）。
    const unknown = Buffer.concat([fs.readFileSync(source), Buffer.from('\n// unknown source\n')]);
    const snapshot = Buffer.from(unknown);
    assert.throws(() => verifyMagicastBytes(unknown), /Unknown or unpatched/);
    assert.deepEqual(unknown, snapshot, '検査は入力を書き換えない');
  });

  test('内蔵コンストラクタが異常入力を拒否し、正常入力を保つ: ' + label, () => {
    const text = fs.readFileSync(source, 'utf8');
    assert.equal(
      text.match(/^import .*$/gm).length,
      1,
      'bundle の前提（import 行）が変わっていない',
    );
    // 隔離 VM で内蔵コンストラクタだけを取り出す（実メモリへ mappings を展開しない）。
    const code =
      text.replace(/^import .*$/m, 'const babelParser = {};').replace(/^export .*$/m, '') +
      '\nrequire_source_map_consumer().SourceMapConsumer;';
    const Consumer = vm.runInNewContext(code, { process, Buffer, console }, { timeout: 1000 });
    consumerControls(Consumer);
  });

  test('公開 API の generateCode が正常系を保ち、異常な offset を拒否する: ' + label, async () => {
    const api = await import(pathToFileURL(path.join(directory, 'dist/index.js')));
    const core = await import(pathToFileURL(path.join(directory, 'dist/core.js')));
    const helperApi = await import(pathToFileURL(path.join(directory, 'dist/helpers.js')));
    assert(Object.keys(helperApi).length > 0);
    assert.equal(api.generateCode, core.generateCode);
    const helpers = fs.readFileSync(path.join(directory, 'dist/helpers.js'), 'utf8');
    assert.match(helpers, /from "\.\/builders-CDdrUKLb\.js"/);

    const make = () => {
      const node = api.parseModule(basic.sourcesContent[0], { sourceFileName: 'fixture.ts' });
      node.exports.default.count = 2;
      return node;
    };
    for (const [name, map] of [
      ['default', undefined],
      ['flat', basic],
      ['indexed', indexed(0)],
      ['indexed-column', indexed(0, 3)],
    ]) {
      for (const representation of ['object', 'string']) {
        const result = api.generateCode(make(), {
          sourceMapName: 'out.js',
          ...(map
            ? { inputSourceMap: representation === 'object' ? map : JSON.stringify(map) }
            : {}),
        });
        assert.equal(result.code, 'export default { enabled: true, count: 2 };');
        assert.deepEqual(result.map, {
          version: 3,
          sources: [name === 'default' ? 'fixture.ts' : 'original.ts'],
          names: [],
          mappings:
            name === 'default'
              ? oldDefaultMappings
              : name === 'flat'
                ? oldFlatMappings
                : name === 'indexed'
                  ? oldFlatMappings.substring(5)
                  : oldColumnOffsetMappings,
          file: 'out.js',
          sourcesContent: basic.sourcesContent,
        });
      }
    }
    for (const map of invalid)
      for (const value of [map, JSON.stringify(map)])
        assert.throws(
          () => core.generateCode(make(), { sourceMapName: 'out.js', inputSourceMap: value }),
          /Section offset|required argument/,
        );
  });
}
