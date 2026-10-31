#!/usr/bin/env node
/**
 * 画面の E2E（Playwright）を CI で走らせる前の前提検査（d808）。
 *
 * E2E はこれまで手元だけで走っていたため、CI へ載せるには「CI の中で何に触るか」を
 * 実行の直前に固定する必要がある。ここで見るのは 3 点だけで、E2E の妥当性は見ない:
 *
 *   1. 画面の E2E が、外部のホスト・実 DB の接続先を向いていないこと
 *      （対象は packages/frontend/e2e/ 配下の spec と helpers。値は規約で固定する）
 *   2. 設定が自分でサーバーを起動する形（webServer）であること
 *      ＝ CI で「起動していない相手を叩いて赤」になる経路を作らない
 *   3. 本番の接続先らしい値（DATABASE_URL のホストが localhost 以外・NEXT_PUBLIC_API_URL が
 *      外部・NODE_ENV=production）が渡されていないこと
 *
 * 前提が崩れた版を「E2E として走らせない」ための門で、画面が正しいかは見ない。
 * 実体の判定は scripts/e2e-preflight.test.mjs が固定する。
 *
 * 使い方: node scripts/e2e-preflight.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const E2E_DIR = 'packages/frontend/e2e';
export const PLAYWRIGHT_CONFIG = 'packages/frontend/playwright.config.ts';
export const NEXT_CONFIG = 'packages/frontend/next.config.ts';

/** 明示的に規約で許す接続先（試験の外へ出ないものだけ）。 */
export const ALLOWED_HOSTS = ['localhost', '127.0.0.1'];

/**
 * E2E のソースから、外部への接続先らしい文字列（http(s)://…）と DB 接続文字列を拾う。
 * コメント行は除く（説明のための URL を接続先と誤認しない）。
 */
export function findEndpoints(text) {
  const body = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
  const urls = [...body.matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => m[0]);
  const databases = [...body.matchAll(/postgres(?:ql)?:\/\/[^\s'"`)]+/g)].map((m) => m[0]);
  return { urls, databases };
}

/** 接続先のホスト名を取り出す（取れなければその文字列をそのまま返す）。 */
export function hostOf(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return endpoint;
  }
}

/** 1 ファイル分の違反を返す（空配列なら問題なし）。 */
export function violationsIn(rel, text) {
  const problems = [];
  const { urls, databases } = findEndpoints(text);

  for (const url of urls) {
    const host = hostOf(url);
    if (!ALLOWED_HOSTS.includes(host)) {
      problems.push(`${rel}: 外部のホストを向いている（${url}）`);
    }
  }
  for (const url of databases) {
    const host = hostOf(url);
    if (!ALLOWED_HOSTS.includes(host)) {
      problems.push(`${rel}: 外部の DB を向いている（${url}）`);
    }
  }
  return problems;
}

/** e2e ディレクトリ配下のソース一式（拡張子で絞り、結果の順序を固定する）。 */
export function sourceFiles() {
  const root = path.join(ROOT, E2E_DIR);
  const found = [];
  // ディレクトリごと消えている場合も「0 件」として返す（例外で落とさない。呼び元が
  // 「E2E のソースが無い」として扱い、E2E の途中終了ではなく検査の失敗として報告する）。
  if (!existsSync(root)) return [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name)) found.push(abs);
    }
  };
  walk(root);
  // 順序を固定する（失敗の表示が実行ごとに入れ替わらない）。
  return found.sort().map((abs) => path.relative(ROOT, abs).split(path.sep).join('/'));
}

/** webServer を設定が持つか（CI で相手を自分で起動できる形か）。 */
export function hasWebServer(configText) {
  const body = configText
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
  return /\bwebServer\s*:/.test(body);
}

/**
 * webServer の中身を読む（d808 の独立の目の指摘＝`webServer:` の語があるだけでは
 * 「CI で自分が起動する」にならない）。
 *
 * 見るのは 2 点:
 *   - `reuseExistingServer` が CI で false になること（true だと CI の起動済みの何かを
 *     そのまま使い、試験の前提が実行環境に左右される）
 *   - 起動コマンドが build 済みの配布物を配信する入口（next start）と、開発サーバーの入口
 *     （next dev）の両方を用意していること（CI は next start で見る）
 */
/**
 * オブジェクト本体を括弧の対応で切り出す（行頭の字下げでは切らない）。
 *
 * 字下げで切ると、ブロック内の注釈や例（2 スペース字下げで書かれた行）で切れて、
 * 後ろの項目を読まないまま緑になる（独立の目の指摘）。開始位置から `{` を数えて閉じる
 * `}` までを取り、途中の文字列リテラル内の括弧は無視する。
 */
export function extractObject(text, startPattern) {
  const start = startPattern.exec(text);
  if (start === null) return null;
  const open = text.indexOf('{', start.index);
  if (open === -1) return null;
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * ブロック内で、入れ子のオブジェクト（深さ 2 以上）に現れるキーの数を数える。
 * webServer 直下のキーだけを対象にするための補助（入れ子の同名キーを重複と数えない）。
 */
export function countNestedKeys(block, key) {
  let depth = 0;
  let quote = null;
  let count = 0;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    } else if (depth >= 1 && block.startsWith(key, i) && /:/.test(block[i + key.length] ?? '')) {
      count++;
    }
  }
  return count;
}

/** CI で false になる書き方（この 1 形だけを通す）。 */
const IS_CI_FALSE = /reuseExistingServer\s*:\s*!\s*process\.env\.CI\b/;

export function webServerProblems(configText) {
  const body = configText
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
  const problems = [];
  const block = extractObject(body, /webServer\s*:\s*\{/);
  if (block === null) {
    return [`${PLAYWRIGHT_CONFIG} の webServer の本体を読めない（起動の条件を確認できない）`];
  }
  // 同じオブジェクト内で同じキーを 2 回書くと後の値が勝つ（先頭の false を見て緑にする穴）。
  // 入れ子の別オブジェクト（例: client: { … }）が同じ名前を使うのは重複ではないため、
  // 数えるのは webServer 直下（深さ 1）のキーだけにする（再レビューの指摘）。
  const topLevelKeys = (block.match(/reuseExistingServer\s*:/g) ?? []).length;
  const nestedKeys = countNestedKeys(block, 'reuseExistingServer');
  const reuseCount = topLevelKeys - nestedKeys;
  if (reuseCount > 1) {
    problems.push(
      `${PLAYWRIGHT_CONFIG} の webServer が同じオブジェクトで reuseExistingServer を重複して書いている（後に書いた値が効き、起動の条件を読めない）`,
    );
  } else if (reuseCount === 0 || !IS_CI_FALSE.test(block)) {
    // CI で false になる書き方だけを通す（`!process.env.CI`）。三項演算子や数値など、
    // 「CI で false」を読めない式は前提が確かめられないため弾く（再レビューの指摘）。
    problems.push(
      `${PLAYWRIGHT_CONFIG} の webServer が reuseExistingServer を CI で false にしていない（起動済みの何かをそのまま使う）`,
    );
  }
  const command = /command\s*:\s*([^\n]+)/.exec(block);
  if (command === null) {
    problems.push(`${PLAYWRIGHT_CONFIG} の webServer に command が無い（自分で起動しない）`);
  } else if (!/next start/.test(block)) {
    // 起動コマンドは CI / 手元で分岐することがある（CI は next start・手元は next dev）。
    // ブロック全体に next start が現れること（CI の分岐）を見る。
    problems.push(
      `${PLAYWRIGHT_CONFIG} の webServer に next start が無い（配布物ではなく開発サーバーで見ている）`,
    );
  }
  return problems;
}

/**
 * E2E が差し替える API の接続先が、アプリの既定値と一致するか（d808 の独立の目の指摘・d864）。
 *
 * 画面は既定で `NEXT_PUBLIC_API_URL` の値（`next.config.ts`）を叩く。spec 側の差し替えが
 * 別の接続先を掴むと、試験は「相手が居ない」まま赤くなり、前提の検査は緑のままになる。
 *
 * 照合するのは、backend を差し替える部品（helpers/backend-stub.ts）と、その部品から
 * 接続先を受け取る spec（`./helpers/backend-stub` を読むもの）の全部。1 本の spec だけを
 * 見ると、別の spec が別の接続先を掴んでも気づけない（d864 で 3 本を同じ形へ寄せた）。
 */
export function apiOriginProblems(
  texts,
  defaultApiUrl,
  read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8'),
  specsOnly = false,
) {
  // 部品の外（spec 側）の掴み直しだけを見たい時は、spec に絞る。
  const targets = specsOnly
    ? texts.filter((rel) => /\.spec\.ts$/.test(rel))
    : texts.filter((rel) => existsSync(path.join(ROOT, rel)));
  const origin = (() => {
    try {
      return new URL(defaultApiUrl).origin;
    } catch {
      return null;
    }
  })();
  if (origin === null) {
    return [`アプリの既定の API 接続先を読めない（${defaultApiUrl}）`];
  }
  const problems = [];
  let found = 0;
  for (const rel of targets) {
    const text = read(rel);
    for (const stubbed of text.matchAll(/(\w+)\s*=\s*'(https?:\/\/[^']+)'/g)) {
      found++;
      const stubbedOrigin = (() => {
        try {
          return new URL(stubbed[2]).origin;
        } catch {
          return null;
        }
      })();
      // ホストは同じで、/api/v1 を付け忘れた形（掴み直しに値しない）。
      if (stubbedOrigin === origin && new URL(stubbed[2]).pathname !== '/api/v1') {
        problems.push(`${rel} の差し替える接続先に /api/v1 が付いていない（${stubbed[2]}）`);
        continue;
      }
      if (stubbedOrigin !== origin) {
        problems.push(
          `${rel} が差し替える接続先（${stubbedOrigin}）がアプリの既定値（${origin}）と違う`,
        );
      }
    }
  }
  if (found === 0 && !specsOnly) {
    // 部品が消えている時は、揃える対象そのものが無い（別の報告が「ソースが無い」を出す）。
    problems.push(
      existsSync(path.join(ROOT, BACKEND_STUB))
        ? `${BACKEND_STUB} が差し替える API の接続先を持たない（背面を差し替えずに実物へ触る試験になっている）`
        : `${BACKEND_STUB} が無い（背面を差し替える部品が消えている）`,
    );
  }
  return problems;
}

/** 背面を差し替える部品の置き場所（接続先はここ 1 か所が持つ）。 */
export const BACKEND_STUB = `${E2E_DIR}/helpers/backend-stub.ts`;

/** 差し替えの部品を読む spec（接続先を部品から受け取るもの）。 */
export function stubbingFiles(
  files = sourceFiles(),
  read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8'),
) {
  return files
    .filter((rel) => /\.spec\.ts$/.test(rel))
    .filter((rel) => /from\s+'\.\/helpers\/backend-stub'/.test(read(rel)));
}

/** 環境変数の違反を返す。 */
export function envViolations(env) {
  const problems = [];
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl !== '') {
    const host = hostOf(databaseUrl);
    if (!ALLOWED_HOSTS.includes(host)) {
      problems.push(`DATABASE_URL が手元の外を向いている（${host}）`);
    }
  }
  const apiUrl = env.NEXT_PUBLIC_API_URL;
  if (apiUrl !== undefined && apiUrl !== '') {
    const host = hostOf(apiUrl);
    if (!ALLOWED_HOSTS.includes(host)) {
      problems.push(`NEXT_PUBLIC_API_URL が手元の外を向いている（${host}）`);
    }
  }
  if (env.NODE_ENV === 'production') {
    problems.push('NODE_ENV=production で走らせようとしている（本番の分岐を E2E で検証しない）');
  }
  return problems;
}

/** すべての検査をまとめて走らせ、違反の一覧を返す（空なら合格）。 */
export function check(
  files = sourceFiles(),
  env = process.env,
  read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8'),
) {
  const problems = [];

  if (files.length === 0) {
    problems.push(`${E2E_DIR} に E2E のソースが無い（配線だけ残って試験が消えている）`);
  }
  for (const rel of files) {
    problems.push(...violationsIn(rel, read(rel)));
  }
  const configText = read(PLAYWRIGHT_CONFIG);
  if (!hasWebServer(configText)) {
    problems.push(
      `${PLAYWRIGHT_CONFIG} が webServer を持たない（CI で相手を起動できず、起動待ちで赤くなる）`,
    );
  } else {
    problems.push(...webServerProblems(configText));
  }
  // 差し替える接続先と、アプリの既定値（next.config.ts）が一致すること。
  // 見るのは、背面を差し替える部品（helpers/backend-stub.ts）と、その部品から接続先を
  // 受け取る spec の全部（1 本だけを見ると、別の spec の食い違いに気づけない・d864）。
  const stubbing = stubbingFiles(files, read);
  const defaultUrl = defaultApiUrl(read(NEXT_CONFIG));
  const fromStub = apiOriginProblems([BACKEND_STUB, ...stubbing], defaultUrl, read);
  problems.push(...fromStub);
  // 部品の外（spec 側）で接続先を掴み直していないか。部品が無い時は、この見方が本体になる。
  const fromSpecs = apiOriginProblems(stubbing, defaultUrl, read, true);
  problems.push(...fromSpecs.filter((problem) => !fromStub.includes(problem)));
  problems.push(...envViolations(env));

  return problems;
}

/** アプリの既定の API 接続先（next.config.ts の env / NEXT_PUBLIC_API_URL の既定値）。 */
export function defaultApiUrl(nextConfigText) {
  const match = /NEXT_PUBLIC_API_URL\s*\|\|\s*'(https?:\/\/[^']+)'/.exec(nextConfigText);
  return match === null ? '' : match[1];
}

// スクリプトとして直接叩かれた時だけ実行する（試験からは import して使う）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = check();
  if (problems.length > 0) {
    console.error('画面の E2E の前提が崩れている:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      ok: true,
      checked: [E2E_DIR, PLAYWRIGHT_CONFIG],
      note: 'E2E の接続先が手元に閉じること・webServer で自分で起動すること・本番の値が渡っていないことを確認した',
    }),
  );
}
