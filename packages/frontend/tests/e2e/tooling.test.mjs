// Tooling regression only: this fixture is not the Reference product or its IdP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import ExcelJS from 'exceljs';
import { launchBrowser } from './lib/auth-helpers.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const toolsDir = fileURLToPath(new URL('./', import.meta.url));

test('UI tools preserve OIDC state, reject invalid sessions, and report Excel failures', async () => {
  await mkdir(resolve(root, 'tmp'), { recursive: true });
  const dir = await mkdtemp(resolve(root, 'tmp/ui-tools-'));
  const server = createServer((req, res) => {
    if (req.url === '/api/v1/auth/me') {
      const role = req.headers.cookie?.includes('fixture=admin') ? 'SYS_ADMIN' : 'WH_USER';
      if (!req.headers.cookie?.includes('fixture=')) res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      const status = req.headers.cookie?.includes('fixture=disabled') ? 'INACTIVE' : 'ACTIVE';
      res.end(JSON.stringify({ success: true, data: { role, status } }));
    } else if (req.url?.startsWith('/api/v1/products')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 'fixture-product' }] }));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<h1>Tooling fixture</h1><input name="title"><button>Save</button>');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const savedEnv = { ...process.env };
  process.env.UI_TEST_BACKEND = origin;
  process.env.UI_TEST_FRONTEND = origin;
  process.env.UI_TEST_AUTH_DIR = dir;
  process.env.UI_TEST_OUT_DIR = resolve(dir, 'screenshots');
  for (const [role, value] of [
    ['WH_USER', 'warehouse'],
    ['SYS_ADMIN', 'admin'],
  ]) {
    await writeFile(
      resolve(dir, `${role}.json`),
      JSON.stringify({
        cookies: [
          {
            name: 'fixture',
            value,
            domain: '127.0.0.1',
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      }),
    );
  }
  // Dynamic import ensures the configured backend is captured after fixture startup.
  const auth = await import(`./lib/auth-helpers.mjs?fixture=${Date.now()}`);
  const browser = await launchBrowser();
  try {
    await auth.withRole(browser, 'WH_USER', async (context) => {
      const page = await context.newPage();
      await page.goto(origin);
      assert.equal(
        await page.evaluate(async () => (await (await fetch('/api/v1/auth/me')).json()).data.role),
        'WH_USER',
      );
    });
    await assert.rejects(
      auth.withRole(browser, 'MISSING', async () => {}),
      /ENOENT/,
    );
    await writeFile(resolve(dir, 'WH_USER.json'), await readFile(resolve(dir, 'SYS_ADMIN.json')));
    await assert.rejects(
      auth.withRole(browser, 'WH_USER', async () => {}),
      /active WH_USER/,
    );
    await writeFile(
      resolve(dir, 'WH_USER.json'),
      JSON.stringify({
        cookies: [
          {
            name: 'fixture',
            value: 'disabled',
            domain: '127.0.0.1',
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      }),
    );
    await assert.rejects(
      auth.withRole(browser, 'WH_USER', async () => {}),
      /active WH_USER/,
    );
    await writeFile(resolve(dir, 'WH_USER.json'), JSON.stringify({ cookies: [], origins: [] }));
    await assert.rejects(
      auth.withRole(browser, 'WH_USER', async () => {}),
      /HTTP 401/,
    );
    await writeFile(
      resolve(dir, 'WH_USER.json'),
      JSON.stringify({
        cookies: [
          {
            name: 'fixture',
            value: 'warehouse',
            domain: '127.0.0.1',
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      }),
    );

    const columns = [
      'scenarioId',
      'scenarioName',
      'patternId',
      'patternName',
      'precondRole',
      'precondData',
      'stepNo',
      'operation',
      'expected',
      'judgeMethod',
      'result',
      'evidence',
      'note',
    ];
    const makeWorkbook = async (name, expected) => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('scenarios');
      sheet.addRow(columns);
      sheet.addRow([
        'fixture',
        '',
        'one',
        '',
        'WH_USER',
        '',
        1,
        'goto: /dashboard',
        expected,
        'dom',
      ]);
      sheet.addRow([
        'fixture',
        '',
        'one',
        '',
        'WH_USER',
        '',
        2,
        'fill: input[name="title"] = "sample"',
        'expectVisible: input',
        'dom',
      ]);
      const path = resolve(dir, name);
      await book.xlsx.writeFile(path);
      return path;
    };
    const run = (file, args = []) =>
      new Promise((done, reject) => {
        const child = spawn(process.execPath, [resolve(toolsDir, file), ...args], {
          cwd: root,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
        });
        let output = '';
        child.stdout.on('data', (chunk) => {
          output += chunk;
        });
        child.stderr.on('data', (chunk) => {
          output += chunk;
        });
        child.on('error', reject);
        child.on('exit', (code) => done({ code, output }));
      });
    const passPath = await makeWorkbook('pass.xlsx', 'expectText: h1 = Tooling fixture');
    const pass = await run('run-scenario.mjs', [passPath]);
    assert.equal(pass.code, 0, pass.output);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(passPath);
    assert.equal(book.getWorksheet('scenarios').getRow(2).getCell(11).value, 'OK');
    const visionBook = new ExcelJS.Workbook();
    await visionBook.xlsx.readFile(passPath);
    visionBook.getWorksheet('scenarios').getRow(2).getCell(10).value = 'vision';
    const visionPath = resolve(dir, 'vision.xlsx');
    await visionBook.xlsx.writeFile(visionPath);
    const vision = await run('run-scenario.mjs', [visionPath]);
    assert.equal(vision.code, 0, vision.output);
    await visionBook.xlsx.readFile(visionPath);
    assert.equal(visionBook.getWorksheet('scenarios').getRow(2).getCell(11).value, 'pending');
    const failPath = await makeWorkbook('fail.xlsx', 'expectText: h1 = Missing');
    const fail = await run('run-scenario.mjs', [failPath]);
    assert.equal(fail.code, 2, fail.output);
    await book.xlsx.readFile(failPath);
    assert.equal(book.getWorksheet('scenarios').getRow(2).getCell(11).value, 'NG');
    assert.equal(book.getWorksheet('scenarios').getRow(3).getCell(11).value, 'skip');
    const capture = await run('capture-all.mjs');
    assert.equal(capture.code, 0, capture.output);
    await readFile(resolve(dir, 'screenshots/scenario-1-whuser-dashboard.png'));
    const flash = await run('flash-check.mjs');
    assert.equal(flash.code, 0, flash.output);
    await readFile(resolve(dir, 'screenshots/E-whuser-products-view-final.png'));
    const usage = await run('run-scenario.mjs');
    assert.equal(usage.code, 1, usage.output);
    assert.match(usage.output, /usage:/);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
    for (const key of [
      'UI_TEST_BACKEND',
      'UI_TEST_FRONTEND',
      'UI_TEST_AUTH_DIR',
      'UI_TEST_OUT_DIR',
    ]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }
});
