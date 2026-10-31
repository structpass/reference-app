import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ActiveStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { UsersRepository } from '../src/modules/users/repositories/users.repository';
import { UsersService } from '../src/modules/users/users.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { TokenDenylistService } from '../src/modules/auth/services/token-denylist.service';
import { TokenDenylistRepository } from '../src/modules/auth/repositories/token-denylist.repository';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('利用者の状態 — 保存・検索・SSO provisioning・JWTの実DB結合', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repo: UsersRepository;
  let users: UsersService;
  let strategy: JwtStrategy;
  let auth: AuthService;
  const previousUrl = process.env.DATABASE_URL;
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    // 既存の予測在庫索引migrationはpg_trgm導入済みを前提にする。
    // その前提を明示して用意し、d604以外のmigrationを試験内で改変しない。
    const extension = await container.exec([
      'psql',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'CREATE EXTENSION pg_trgm',
    ]);
    expect(extension.exitCode).toBe(0);
    process.env.DATABASE_URL = container.getConnectionUri();
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: resolve(__dirname, '..'),
        env: process.env,
        stdio: 'inherit',
        timeout: 120_000,
      },
    );
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new UsersRepository(prisma);
    users = new UsersService(repo);
    const jwt = new JwtService({ secret: 'd604-isolated-test-secret' });
    auth = new AuthService(users, jwt);
    strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'd604-isolated-test-secret' }),
      users,
      new TokenDenylistService(new TokenDenylistRepository(prisma)),
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  it('承認待ち→有効化→無効化→SSO再ログインで状態と認証拒否を保つ', async () => {
    const claims = { sub: 'd604-sub', name: 'D604 pending', email: 'd604@example.com' };
    const pending = await users.provisionFromOidc(claims);
    expect(pending).toMatchObject({ role: null, status: ActiveStatus.INACTIVE });
    const payload = { sub: pending.id, jti: 'd604-jti' };
    await expect(strategy.validate(payload)).rejects.toThrow();
    await users.update(
      pending.id,
      { role: UserRole.WH_USER, status: ActiveStatus.ACTIVE },
      UserRole.SYS_ADMIN,
    );
    await expect(strategy.validate(payload)).resolves.toMatchObject({
      id: pending.id,
      role: UserRole.WH_USER,
    });
    expect(await auth.getProfile(pending.id)).toMatchObject({ status: ActiveStatus.ACTIVE });
    await users.update(pending.id, { status: ActiveStatus.INACTIVE }, UserRole.SYS_ADMIN);
    const afterLogin = await users.provisionFromOidc({ ...claims, name: 'D604 renamed' });
    expect(afterLogin).toMatchObject({
      id: pending.id,
      name: 'D604 renamed',
      role: UserRole.WH_USER,
      status: ActiveStatus.INACTIVE,
    });
    await expect(strategy.validate(payload)).rejects.toThrow();
    const created = await users.create(
      { name: 'D604 default', email: 'd604-default@example.com' },
      UserRole.SYS_ADMIN,
    );
    expect(created.data).toMatchObject({ role: null, status: ActiveStatus.ACTIVE });
    const inactive = await repo.findManyPaginated({
      page: 1,
      limit: 20,
      status: ActiveStatus.INACTIVE,
    });
    expect(inactive.meta.total).toBe(1);
    expect(inactive.data.map((u) => u.id)).toEqual([pending.id]);
    const exported = await repo.findManyForExport({
      page: 1,
      limit: 20,
      status: ActiveStatus.ACTIVE,
    });
    expect(exported.map((u) => u.id)).toEqual([created.data.id]);
    expect(exported[0]).not.toHaveProperty('isActive');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
      ActiveStatus.INACTIVE,
    );
  });
});
