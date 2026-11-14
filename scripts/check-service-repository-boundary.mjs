#!/usr/bin/env node
// 「Service は Prisma Client を直接使わない」を機械で確かめる（d1098）。
//
// docs/02-architecture/ARCHITECTURE_INVARIANTS.md の依存方向は
//   Controller -> Service -> Repository -> Prisma
// で、DB に触るのは Repository の役目（L13-14）。同 L40 が「機械的に強制できる規則は
// 型、test、lint、CI へ置く」と定めているため、ここで service 内の `this.prisma.` を検出する。
// 例外は L16 に従って ADR へ理由を書いたものだけを、下の ALLOWED に明示する。
//
// 使い方: node scripts/check-service-repository-boundary.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES_DIR = join(REPO_ROOT, 'packages/backend/src/modules');

// 例外（ADR で理由を記録したものだけ）。足す時は ADR 番号を併記する。
const ALLOWED = new Map([]);

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, acc);
    } else if (e.name.endsWith('.service.ts') && !e.name.endsWith('.spec.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

const services = walk(MODULES_DIR);
// 対象が 0 本なら、置き場の名前が変わったか消えたということ。このまま「違反なし」で
// 通すと、規約が効かないまま緑になる。
if (services.length === 0) {
  console.error(
    `対象の Service が 1 本も見つかりません（置き場を確かめてください）: ${MODULES_DIR}`,
  );
  process.exit(1);
}
const violations = [];

for (const file of services) {
  const rel = relative(MODULES_DIR, file).split('\\').join('/');
  const src = readFileSync(file, 'utf8');
  if (!/this\.prisma\./.test(src)) continue;
  if (ALLOWED.has(rel)) continue;
  const line = src.split('\n').findIndex((l) => /this\.prisma\./.test(l)) + 1;
  violations.push(`${rel}:${line}`);
}

const stale = [...ALLOWED.keys()].filter((rel) => {
  try {
    return !statSync(join(MODULES_DIR, rel)).isFile();
  } catch {
    return true;
  }
});

if (violations.length > 0) {
  console.error('Service が Prisma Client を直接使っています（Repository を経由してください）:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    '\n例外にするなら、理由を docs/decisions/ の ADR に書き、' +
      'scripts/check-service-repository-boundary.mjs の ALLOWED に ADR 番号つきで足してください。',
  );
}
if (stale.length > 0) {
  console.error('ALLOWED に、もう存在しない Service が残っています:');
  for (const s of stale) console.error(`  - ${s}`);
}
if (violations.length > 0 || stale.length > 0) process.exit(1);

console.log(
  `OK: ${services.length} 本の Service を確認（Prisma 直呼びは例外 ${ALLOWED.size} 本のみ）`,
);
