import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('利用者状態の移行 — PostgreSQL 16', () => {
  let container: StartedPostgreSqlContainer;
  const sql = async (command: string) => {
    const result = await container.exec([
      'psql',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-c',
      command,
    ]);
    expect(result.exitCode).toBe(0);
    return result.output.trim();
  };
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
  });
  afterAll(async () => {
    await container?.stop();
  });

  it('有効・無効・承認待ち・既定値を保ち、逆変換で元の行へ戻せる', async () => {
    await sql(`CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE','INACTIVE');
      CREATE TABLE users (id text PRIMARY KEY, role text, is_active boolean NOT NULL DEFAULT true);
      INSERT INTO users VALUES ('active','SYS_ADMIN',true),('disabled','WH_USER',false),('pending',null,false);`);
    const before = await sql("SELECT id,coalesce(role,'pending'),is_active FROM users ORDER BY id");
    const migration = readFileSync(
      resolve(__dirname, '../prisma/migrations/20261020133000_user_active_status/migration.sql'),
      'utf8',
    );
    await sql(migration);
    expect(await sql("SELECT id,coalesce(role,'pending'),status FROM users ORDER BY id")).toBe(
      'active|SYS_ADMIN|ACTIVE\ndisabled|WH_USER|INACTIVE\npending|pending|INACTIVE',
    );
    await sql("INSERT INTO users(id) VALUES ('default')");
    expect(await sql("SELECT status FROM users WHERE id='default'")).toBe('ACTIVE');
    expect(
      await sql(
        "SELECT is_nullable,udt_name FROM information_schema.columns WHERE table_name='users' AND column_name='status'",
      ),
    ).toBe('NO|ActiveStatus');
    await sql(`DELETE FROM users WHERE id='default';
      ALTER TABLE users ALTER COLUMN status DROP DEFAULT;
      ALTER TABLE users ALTER COLUMN status TYPE boolean USING (status = 'ACTIVE'::"ActiveStatus");
      ALTER TABLE users RENAME COLUMN status TO is_active;
      ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true;`);
    expect(await sql("SELECT id,coalesce(role,'pending'),is_active FROM users ORDER BY id")).toBe(
      before,
    );
  });
});
