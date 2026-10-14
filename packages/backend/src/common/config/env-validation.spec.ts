import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_DB_POOL_PARAMS, validateDatabasePoolLimits } from './env-validation';

describe('validateDatabasePoolLimits（ref-0071・rete cmn-0251 の移植）', () => {
  const BASE = 'postgresql://u:p@localhost:5432/struct_pass?schema=public';

  it('connection_limit / pool_timeout が揃っていれば null（OK）', () => {
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=5&pool_timeout=70`)).toBeNull();
  });

  it.each(REQUIRED_DB_POOL_PARAMS)('%s が欠けていたら理由を返す（起動時に気付ける）', (param) => {
    const params = REQUIRED_DB_POOL_PARAMS.filter((p) => p !== param)
      .map((p) => `${p}=5`)
      .join('&');
    const reason = validateDatabasePoolLimits(`${BASE}&${params}`);
    expect(reason).toContain(param);
  });

  it('プール指定が一切無い接続文字列（既存 .env の形）は理由を返す', () => {
    // テンプレートに書くだけでは既存 .env / compose へ伝播しない＝この検査が唯一の歯止め。
    const reason = validateDatabasePoolLimits(BASE);
    expect(reason).toMatch(/connection_limit/);
    expect(reason).toMatch(/pool_timeout/);
  });

  it('値が空文字なら「指定あり」と見なさない（?connection_limit= のような書き損じ）', () => {
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=&pool_timeout=70`)).toContain(
      'connection_limit',
    );
  });

  it('DATABASE_URL 未設定は本検査の対象外（必須検査は main.ts の REQUIRED_ENV_VARS が担う）', () => {
    expect(validateDatabasePoolLimits(undefined)).toBeNull();
    expect(validateDatabasePoolLimits('')).toBeNull();
  });

  it('URL として解析できない接続文字列は本検査の対象外（形式不正は Prisma が落とす）', () => {
    expect(validateDatabasePoolLimits('not-a-url')).toBeNull();
  });

  // ここから下は「存在するだけ」では目的を満たさない値の検査。
  it('pool_timeout=0（無限待ち）は通さない＝防ぎたい状態そのもの', () => {
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=5&pool_timeout=0`)).toContain(
      'pool_timeout',
    );
  });

  it('pool_timeout が最長トランザクション上限（商品一括取込の 60 秒）以下なら通さない', () => {
    // 短すぎると、tx を占有している取込側より先に無関係なリクエストが接続待ち超過で 503 になる。
    // 下限 65 は 60 秒 tx より長く取るための値（写し元 rete の下限 15 は最長 tx 15 秒前提）。
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=5&pool_timeout=60`)).toContain(
      'pool_timeout',
    );
  });

  it('pool_timeout の下限境界 65 を固定する（64 は拒否・65 は通す）', () => {
    // reference は下限を写し元 rete の 15 から 65 へ変えた側なので、境界そのものを pin する。
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=5&pool_timeout=64`)).toContain(
      'pool_timeout',
    );
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=5&pool_timeout=65`)).toBeNull();
  });

  it('connection_limit=0 や過大な指定は通さない（上限の意味が失われる）', () => {
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=0&pool_timeout=70`)).toContain(
      'connection_limit',
    );
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=500&pool_timeout=70`)).toContain(
      'connection_limit',
    );
  });

  it('整数でない値は通さない', () => {
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=abc&pool_timeout=70`)).toContain(
      'connection_limit',
    );
    expect(validateDatabasePoolLimits(`${BASE}&connection_limit=5&pool_timeout=70.5`)).toContain(
      'pool_timeout',
    );
  });

  it('main.ts が起動経路でこの検査を呼び、本番だけ起動を止める', () => {
    // 純関数の spec だけでは配線が消えても緑のままになる（bootstrap を文字列で pin する）。
    const mainSource = readFileSync(join(__dirname, '../../main.ts'), 'utf8');
    expect(mainSource).toContain('validateDatabasePoolLimits(process.env.DATABASE_URL)');
    expect(mainSource).toMatch(/NODE_ENV === 'production'/);
    expect(mainSource).toContain('logger.warn(poolProblem)');
  });

  it('seed.ts も同じ検査を呼び、警告を出して完走する（throw しない）', () => {
    // seed は独立プロセスで main.ts の検査を通らないため、環境構築の順序
    // （DB 作成 → seed → アプリ配備）でプール指定なしのまま進むのを防ぐ。警告のみで止めない
    // （本番同様の起動拒否をすると環境構築の順序が壊れる）。
    const seedSource = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8');
    expect(seedSource).toContain('validateDatabasePoolLimits(process.env.DATABASE_URL)');
    expect(seedSource).toContain('console.warn(`[seed]');
  });
});
