import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import * as path from 'path';

/**
 * 本番（docker-compose.yml）と同じ PG メジャーで並行性を実証するためイメージを固定する。
 * バージョンを揃えないと FOR UPDATE / ON CONFLICT のロック挙動差が紛れ込みうる。
 */
const POSTGRES_IMAGE = 'postgres:16-alpine';

export interface IntegrationDb {
  container: StartedPostgreSqlContainer;
  /** prisma db push / PrismaService から参照する接続 URL（query なしの素の URL）。 */
  databaseUrl: string;
}

/**
 * 使い捨て PostgreSQL コンテナを起動し、本番と同じ migration 群を適用して返す。
 *
 * 実 DB に対する悲観ロック（FOR UPDATE + ensure-row）の直列化を検証する Phase 1b
 * 統合テスト基盤。mock では再現できない「本物の行ロック競合の直列化」を確かめる。
 *
 * `db push`（schema 直反映）ではなく `migrate deploy`（prisma/migrations/* を順次適用）を
 * 使う。db push は制約名・index の DDL が migration と一致しない場合があり、テスト schema が
 * 本番と乖離しうる。並行性検証は @@unique([warehouseId, productId]) の存在に依存するため、
 * 本番と byte 一致した schema で検証する方を採る（起動は数秒遅くなるが fidelity を優先）。
 *
 * execSync は対話プロンプトや接続待ちで無限ハングしないよう timeout を明示する。
 */
export async function startPostgresAndMigrate(): Promise<IntegrationDb> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();

  // test/helpers から 2 つ上が backend パッケージ root。prisma schema / migrations をここから解決する。
  const backendRoot = path.resolve(__dirname, '..', '..');

  execSync('npx prisma migrate deploy', {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    timeout: 120_000,
  });

  return { container, databaseUrl };
}
