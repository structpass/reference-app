#!/usr/bin/env node
/**
 * Node 版の整合検査（v2-416）。
 *
 * 版の正本は .nvmrc（開発と CI が読む）。本番イメージの base は各 Dockerfile 先頭の
 * ARG NODE_VERSION 1 か所で決まり、root package.json の engines が対応する下限を宣言する。
 * この 3 つがずれたまま配布されると、開発・テストと本番で動く版が黙って食い違う
 * （点検時の実測: Dockerfile は node:20-alpine、.nvmrc は 24.14.1、CI は .nvmrc を読む）。
 *
 * 使い方: node scripts/check-node-version.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCKERFILES = ['packages/backend/Dockerfile', 'packages/frontend/Dockerfile'];

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const majorOf = (value) => {
  const match = /(\d+)/.exec(String(value ?? ''));
  return match ? match[1] : null;
};

const problems = [];
const values = {};

values['.nvmrc'] = read('.nvmrc').trim();
values['package.json engines.node'] = JSON.parse(read('package.json')).engines?.node ?? '';

for (const file of DOCKERFILES) {
  const source = read(file);
  const declared = [...source.matchAll(/^ARG NODE_VERSION=(\S+)[ \t]*$/gm)].map((m) => m[1]);
  const hardcoded = [...source.matchAll(/^FROM node:(?!\$\{NODE_VERSION\})\S*/gm)].map((m) => m[0]);
  const stages = [...source.matchAll(/^FROM /gm)].length;
  const usingArg = [...source.matchAll(/^FROM node:\$\{NODE_VERSION\} AS /gm)].length;

  if (declared.length !== 1) {
    problems.push(`${file}: ARG NODE_VERSION は 1 か所にまとめる（現在 ${declared.length} か所）`);
  }
  if (hardcoded.length > 0) {
    problems.push(
      `${file}: base に版を直書きしている（${hardcoded.join(', ')}）。ARG NODE_VERSION を参照する`,
    );
  }
  if (stages !== usingArg) {
    problems.push(
      `${file}: ${stages} ステージ中 ${usingArg} ステージだけが ARG NODE_VERSION を参照している`,
    );
  }
  values[`${file} ARG NODE_VERSION`] = declared[0] ?? '（宣言なし）';
}

const majors = Object.entries(values).map(([label, value]) => {
  const major = majorOf(value);
  if (!major) problems.push(`${label}: 版を読み取れない（値: ${value === '' ? '空' : value}）`);
  return [label, major];
});

const distinct = new Set(majors.map(([, major]) => major).filter(Boolean));
if (distinct.size > 1) {
  const detail = majors.map(([label, major]) => `${label}=${major}`).join(', ');
  problems.push(`Node のメジャー版が揃っていない（${detail}）`);
}

const report = majors.map(([label, major]) => `${major ?? '?'}  ${label}`).join('\n');

if (problems.length > 0) {
  console.error(
    `Node 版の整合検査に失敗した。\n\n${report}\n\n${problems.map((p) => `- ${p}`).join('\n')}\n`,
  );
  process.exit(1);
}

console.log(`Node 版の整合検査 OK\n${report}`);
