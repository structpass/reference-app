import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { objectTypePermissionId } from '@struct-pass/shared';
import { PrismaService } from '../src/database/prisma.service';
import { authCookie, createE2EApp, issueToken, SEED_EMAILS } from './helpers/auth.helper';
import { IntegrationDb, startPostgresAndMigrate } from './helpers/testcontainer.helper';
import { seedUsers } from '../prisma/seed/users';
import { seedRolePermissions } from '../prisma/seed/permissions';
import { seedObjectTypes } from '../prisma/seed/object-types';

/**
 * v2-274: SYS_ADMIN 専用 feature（permissions / system-parameters / object-types）の固定。
 *
 * 実 DB + HTTP で、保存 API の拒否・実効権限の固定・台帳定義 API の禁止・SYS_ADMIN と
 * 動的台帳委任の維持を確認する。mock Repository のユニットテストでは拾えない
 * 「DB 行 → 実効権限 → Guard → 台帳定義 API」の到達経路を実体で見るのが目的。
 */
describe('SYS_ADMIN専用featureの固定 (e2e)', () => {
  let db: IntegrationDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let whUserToken: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    process.env.DATABASE_URL = `${db.databaseUrl}?connection_limit=5&pool_timeout=70`;
    app = await createE2EApp();
    prisma = app.get(PrismaService);
    await seedUsers(prisma);
    await seedRolePermissions(prisma);
    await seedObjectTypes(prisma);
    adminToken = await issueToken(app, SEED_EMAILS.admin);
    whUserToken = await issueToken(app, SEED_EMAILS.whUser);
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await db?.container.stop();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  const roleFeature = { role: UserRole.WH_USER, featureId: 'object-types' } as const;

  const whUserObjectTypesRow = () =>
    prisma.rolePermission.findUniqueOrThrow({ where: { role_featureId: roleFeature } });

  const putRolePermissions = (permissions: unknown[]) =>
    request(app.getHttpServer())
      .put('/api/v1/permissions/roles')
      .set('Cookie', authCookie(adminToken))
      .send({ permissions });

  const objectTypeBody = (name: string) => ({
    name,
    fieldDefs: [{ key: 'note', label: 'メモ', type: 'TEXT' }],
  });

  it('SYS_ADMINが非SYS_ADMINロールへ専用featureの権限を立てる保存入力を400で拒否する', async () => {
    await putRolePermissions([
      {
        role: UserRole.WH_USER,
        featureId: 'object-types',
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
      },
    ]).expect(400);

    // 拒否は書込み前に起きる（部分適用しない）。
    await expect(whUserObjectTypesRow()).resolves.toMatchObject({
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
  }, 180000);

  it('専用featureの全action false行は受理する（権限マトリクスの保存を止めない）', async () => {
    await putRolePermissions([
      {
        role: UserRole.WH_USER,
        featureId: 'object-types',
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      },
      {
        role: UserRole.WH_USER,
        featureId: 'system-parameters',
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      },
    ]).expect(200);
  }, 180000);

  it('不整合なDB行を直接投入しても、実効権限と台帳定義APIは非SYS_ADMINで固定OFFのまま', async () => {
    // 保存 API を迂回して「修正前に書かれた行」と同じ状態を作る。
    await prisma.rolePermission.update({
      where: { role_featureId: roleFeature },
      data: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
    });

    const mine = await request(app.getHttpServer())
      .get('/api/v1/permissions/my-permissions')
      .set('Cookie', authCookie(whUserToken))
      .expect(200);
    const featureIds = mine.body.data.permissions.map(
      (permission: { featureId: string }) => permission.featureId,
    );
    expect(featureIds).not.toContain('object-types');

    // 台帳定義の作成・更新（preset）
    await request(app.getHttpServer())
      .post('/api/v1/object-types')
      .set('Cookie', authCookie(whUserToken))
      .send({ key: 'deny-ledger-274', ...objectTypeBody('拒否確認') })
      .expect(403);

    await request(app.getHttpServer())
      .put('/api/v1/object-types/product')
      .set('Cookie', authCookie(whUserToken))
      .send(objectTypeBody('改ざん確認'))
      .expect(403);

    // preset 読取
    await request(app.getHttpServer())
      .get('/api/v1/object-types/product')
      .set('Cookie', authCookie(whUserToken))
      .expect(403);

    // 動的台帳（権限行なし）は存在を隠す
    await request(app.getHttpServer())
      .get('/api/v1/object-types/supplier-score')
      .set('Cookie', authCookie(whUserToken))
      .expect(404);

    // 不整合行が無い状態と結果が変わらないこと（行の有無に依存しない）。
    await prisma.rolePermission.update({
      where: { role_featureId: roleFeature },
      data: { canView: false, canCreate: false, canUpdate: false, canDelete: false },
    });

    await request(app.getHttpServer())
      .get('/api/v1/object-types/product')
      .set('Cookie', authCookie(whUserToken))
      .expect(403);
  }, 180000);

  it('SYS_ADMINは同じ操作を実行できる（復旧経路の維持）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/object-types')
      .set('Cookie', authCookie(adminToken))
      .send({ key: 'sysadmin-check-274', ...objectTypeBody('管理確認') })
      .expect(201);
    expect(created.body.success).toBe(true);

    await request(app.getHttpServer())
      .put('/api/v1/object-types/sysadmin-check-274')
      .set('Cookie', authCookie(adminToken))
      .send(objectTypeBody('管理確認（更新）'))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/object-types/product')
      .set('Cookie', authCookie(adminToken))
      .expect(200);
  }, 180000);

  it('ユーザー定義台帳ごとの動的権限委任は維持される', async () => {
    await putRolePermissions([
      {
        role: UserRole.WH_USER,
        featureId: objectTypePermissionId('supplier-score'),
        canView: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      },
    ]).expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/object-types/supplier-score')
      .set('Cookie', authCookie(whUserToken))
      .expect(200);
  }, 180000);
});
