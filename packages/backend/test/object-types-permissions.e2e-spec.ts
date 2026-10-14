import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { authCookie, createE2EApp, issueToken, SEED_EMAILS } from './helpers/auth.helper';
import { objectTypePermissionId } from '@struct-pass/shared';

describe('ObjectType 動的CRUD権限 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let whUserToken: string;
  let originalPermission:
    | {
        id: number;
        canView: boolean;
        canCreate: boolean;
        canUpdate: boolean;
        canDelete: boolean;
      }
    | null
    | undefined;
  let createdRecordId: number | undefined;

  const key = 'supplier-score';
  const featureId = objectTypePermissionId(key);

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);
    adminToken = await issueToken(app, SEED_EMAILS.admin);
    whUserToken = await issueToken(app, SEED_EMAILS.whUser);
    originalPermission = await prisma.rolePermission.findUnique({
      where: { role_featureId: { role: 'WH_USER', featureId } },
      select: { id: true, canView: true, canCreate: true, canUpdate: true, canDelete: true },
    });
    await prisma.rolePermission.deleteMany({ where: { role: 'WH_USER', featureId } });
  });

  afterAll(async () => {
    if (createdRecordId !== undefined) {
      await prisma.customRecord.deleteMany({ where: { id: createdRecordId } });
    }
    if (originalPermission) {
      await prisma.rolePermission.update({
        where: { id: originalPermission.id },
        data: {
          canView: originalPermission.canView,
          canCreate: originalPermission.canCreate,
          canUpdate: originalPermission.canUpdate,
          canDelete: originalPermission.canDelete,
        },
      });
    } else {
      await prisma.rolePermission.deleteMany({ where: { role: 'WH_USER', featureId } });
    }
    await app.close();
  });

  const setPermission = (permission: {
    canView: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }) =>
    prisma.rolePermission.upsert({
      where: { role_featureId: { role: 'WH_USER', featureId } },
      update: permission,
      create: { role: 'WH_USER', featureId, ...permission },
    });

  it('権限なしの非プリセット台帳は404で隠蔽する', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/object-types/${key}`)
      .set('Cookie', authCookie(whUserToken))
      .expect(404);
  });

  it('view権限付与後は台帳取得と一覧表示が200になる', async () => {
    await setPermission({ canView: true, canCreate: false, canUpdate: false, canDelete: false });

    await request(app.getHttpServer())
      .get(`/api/v1/object-types/${key}`)
      .set('Cookie', authCookie(whUserToken))
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/object-types')
      .set('Cookie', authCookie(whUserToken))
      .expect(200);
    expect(list.body.data.some((item: { key: string }) => item.key === key)).toBe(true);
  });

  it('write権限だけではview併用条件を満たさず404になる', async () => {
    await setPermission({ canView: false, canCreate: true, canUpdate: false, canDelete: false });

    await request(app.getHttpServer())
      .post(`/api/v1/object-types/${key}/records`)
      .set('Cookie', authCookie(whUserToken))
      .send({ data: { name: '権限境界テスト' } })
      .expect(404);
  });

  it('viewとcreateの両方があれば動的台帳レコードを作成できる', async () => {
    await setPermission({ canView: true, canCreate: true, canUpdate: false, canDelete: false });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/object-types/${key}/records`)
      .set('Cookie', authCookie(whUserToken))
      .send({ data: { name: '権限境界テスト' } })
      .expect(201);

    expect(response.body.success).toBe(true);
    createdRecordId = response.body.data.id;
  });

  it('presetは従来の静的object-types権限を使い403になる', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/object-types/product')
      .set('Cookie', authCookie(whUserToken))
      .expect(403);
  });

  it('キー形式不正は400、未知keyは404になる', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/object-types/Bad_Key')
      .set('Cookie', authCookie(whUserToken))
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/object-types/no-such-ledger')
      .set('Cookie', authCookie(whUserToken))
      .expect(404);
  });

  it('SYS_ADMINは動的台帳権限行なしでも取得できる', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/object-types/${key}`)
      .set('Cookie', authCookie(adminToken))
      .expect(200);
  });
});
