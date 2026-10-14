import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createE2EApp } from './helpers/auth.helper';
import { IntegrationDb, startPostgresAndMigrate } from './helpers/testcontainer.helper';
import { PRESET_OBJECT_TYPE_DEFINITIONS } from '@struct-pass/shared';
import { seedObjectTypes } from '../prisma/seed/object-types';

describe('ObjectType preset seed and integration catalog (e2e)', () => {
  let db: IntegrationDb;
  let app: INestApplication;
  let prisma: PrismaService;
  const serviceToken = 'object-type-catalog-test-token';
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalIntegrationToken = process.env.INTEGRATION_SERVICE_TOKEN;

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    process.env.DATABASE_URL = `${db.databaseUrl}?connection_limit=5&pool_timeout=70`;
    process.env.INTEGRATION_SERVICE_TOKEN = serviceToken;
    app = await createE2EApp();
    prisma = app.get(PrismaService);
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await db?.container.stop();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalIntegrationToken === undefined) delete process.env.INTEGRATION_SERVICE_TOKEN;
    else process.env.INTEGRATION_SERVICE_TOKEN = originalIntegrationToken;
  });

  beforeEach(async () => {
    await prisma.customRecord.deleteMany();
    await prisma.fieldDef.deleteMany();
    await prisma.objectType.deleteMany();
  });

  it('non-presetの予約key衝突時は実DBで全書込みを行わず関連データを保持する', async () => {
    const collision = await prisma.objectType.create({
      data: {
        key: 'supplier',
        name: '既存の自由台帳',
        icon: 'database',
        sortOrder: 99,
        isPreset: false,
      },
    });
    const field = await prisma.fieldDef.create({
      data: {
        objectTypeId: collision.id,
        key: 'note',
        label: 'メモ',
        type: 'TEXT',
        required: false,
        sortOrder: 1,
      },
    });
    const record = await prisma.customRecord.create({
      data: { objectTypeId: collision.id, data: { note: '保持する' } },
    });

    await expect(seedObjectTypes(prisma)).rejects.toThrow('reserved key collision');

    await expect(
      prisma.objectType.findMany({
        include: { fieldDefs: true, customRecords: true },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: collision.id,
        key: 'supplier',
        name: '既存の自由台帳',
        isPreset: false,
        fieldDefs: [expect.objectContaining({ id: field.id, key: 'note' })],
        customRecords: [expect.objectContaining({ id: record.id, data: { note: '保持する' } })],
      }),
    ]);
  }, 180000);

  it('既存presetの関連データを保持しつつ全5 presetをbackfillし再実行を冪等化する', async () => {
    const product = await prisma.objectType.create({
      data: {
        key: 'product',
        name: '旧商品名',
        icon: 'old-icon',
        sortOrder: 99,
        isPreset: true,
      },
    });
    const field = await prisma.fieldDef.create({
      data: {
        objectTypeId: product.id,
        key: 'legacyCode',
        label: '既存コード',
        type: 'TEXT',
        required: true,
        sortOrder: 1,
      },
    });
    const record = await prisma.customRecord.create({
      data: { objectTypeId: product.id, data: { legacyCode: 'P-001' } },
    });

    await seedObjectTypes(prisma);

    const presets = await prisma.objectType.findMany({
      where: { isPreset: true },
      orderBy: { sortOrder: 'asc' },
    });
    expect(
      presets.map(({ key, name, icon, sortOrder }) => ({ key, name, icon, sortOrder })),
    ).toEqual(
      PRESET_OBJECT_TYPE_DEFINITIONS.map(({ key, name, icon, sortOrder }) => ({
        key,
        name,
        icon,
        sortOrder,
      })),
    );

    const productAfter = await prisma.objectType.findUniqueOrThrow({
      where: { key: 'product' },
      include: { fieldDefs: true, customRecords: true },
    });
    expect(productAfter.fieldDefs).toEqual([
      expect.objectContaining({ id: field.id, key: 'legacyCode', label: '既存コード' }),
    ]);
    expect(productAfter.customRecords).toEqual([
      expect.objectContaining({ id: record.id, data: { legacyCode: 'P-001' } }),
    ]);

    const firstCustomRecordCount = await prisma.customRecord.count({
      where: { objectType: { is: { key: 'supplier-score' } } },
    });
    expect(firstCustomRecordCount).toBe(25);

    await seedObjectTypes(prisma);

    await expect(
      prisma.customRecord.count({ where: { objectType: { is: { key: 'supplier-score' } } } }),
    ).resolves.toBe(25);
    await expect(prisma.customRecord.count({ where: { objectTypeId: product.id } })).resolves.toBe(
      1,
    );
  }, 180000);

  it('ServiceToken APIは5 presetとcustomを既存response shapeで未filtered返却する', async () => {
    await seedObjectTypes(prisma);

    const response = await request(app.getHttpServer())
      .get('/api/v1/integration/object-types')
      .set('x-service-token', serviceToken)
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({ success: true }));
    expect(response.body.data.map((item: { key: string }) => item.key)).toEqual([
      ...PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => preset.key),
      'supplier-score',
    ]);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'product', isPreset: true }),
        expect.objectContaining({ key: 'supplier-score', isPreset: false }),
      ]),
    );

    await request(app.getHttpServer())
      .get('/api/v1/integration/object-types')
      .set('x-service-token', 'wrong-token')
      .expect(401);
  }, 180000);
});
