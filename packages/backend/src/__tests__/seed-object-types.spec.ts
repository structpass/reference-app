import { Prisma } from '@prisma/client';
import {
  FEATURE_IDS,
  PRESET_OBJECT_TYPE_DEFINITIONS,
  projectPresetObjectType,
} from '@struct-pass/shared';
import { seedObjectTypes } from '../../prisma/seed/object-types';
import { DEFAULT_ROLE_PERMISSIONS } from '../modules/permissions/constants/role-permissions.constants';

function makePrisma(existing: Array<{ key: string; isPreset: boolean }> = []) {
  const rows = [...existing];
  const tx = {
    objectType: {
      findMany: jest.fn().mockImplementation(async () => rows.map((row) => ({ ...row }))),
      create: jest.fn().mockImplementation(async ({ data }) => {
        rows.push({ key: data.key, isPreset: data.isPreset });
        return data;
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    objectType: {
      upsert: jest.fn().mockResolvedValue({ id: 99 }),
    },
    fieldDef: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    customRecord: {
      count: jest.fn().mockResolvedValue(1),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return { prisma, tx };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(code, {
    code,
    clientVersion: '6.2.0',
  });
}

describe('preset ObjectType canonical projection', () => {
  it('5 presetのfeatureId・専用route・表示metadataが一意である', () => {
    expect(PRESET_OBJECT_TYPE_DEFINITIONS).toHaveLength(5);
    expect(new Set(PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => preset.key)).size).toBe(5);
    expect(new Set(PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => preset.featureId)).size).toBe(5);
    expect(
      PRESET_OBJECT_TYPE_DEFINITIONS.every((preset) => FEATURE_IDS.includes(preset.featureId)),
    ).toBe(true);
    expect(
      PRESET_OBJECT_TYPE_DEFINITIONS.map(({ key, featureId, route }) => ({
        key,
        featureId,
        route,
      })),
    ).toEqual([
      { key: 'product', featureId: 'products', route: '/dashboard/products' },
      { key: 'warehouse', featureId: 'warehouses', route: '/dashboard/warehouses' },
      { key: 'carrier', featureId: 'carriers', route: '/dashboard/carriers' },
      { key: 'supplier', featureId: 'suppliers', route: '/dashboard/suppliers' },
      { key: 'category', featureId: 'categories', route: '/dashboard/categories' },
    ]);
    expect(PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => preset.route)).toEqual([
      '/dashboard/products',
      '/dashboard/warehouses',
      '/dashboard/carriers',
      '/dashboard/suppliers',
      '/dashboard/categories',
    ]);
  });

  // ナビ側の接続（canonical な5 presetが専用routeで「マスタ管理」に出ること）は、frontend の
  // sidebar.test.tsx と feature-list.test.ts が覆う。この spec は frontend のソースを import しない
  // （backend の型検査は frontend の `@/` alias を解決できず、suite ごと起動不能になっていた）。
  it('canonicalな5 presetが静的権限へ接続される', () => {
    const expectedPermissions = {
      WH_USER: { canView: true, canCreate: false, canUpdate: false, canDelete: false },
      WH_ADMIN: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
      OF_USER: { canView: true, canCreate: false, canUpdate: false, canDelete: false },
      OF_ADMIN: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
    };

    for (const preset of PRESET_OBJECT_TYPE_DEFINITIONS) {
      expect(DEFAULT_ROLE_PERMISSIONS[preset.featureId]).toEqual(expectedPermissions);
    }
  });

  it('presetだけをprojectionし、non-preset・未知keyは除外する', () => {
    expect(projectPresetObjectType({ key: 'product', isPreset: true })).toMatchObject({
      featureId: 'products',
      route: '/dashboard/products',
    });
    expect(projectPresetObjectType({ key: 'supplier-score', isPreset: false })).toBeUndefined();
    expect(projectPresetObjectType({ key: 'unknown', isPreset: true })).toBeUndefined();
  });
});

describe('seedObjectTypes', () => {
  it('全5 keyを同一Serializable transactionで作成する', async () => {
    const { prisma, tx } = makePrisma();

    await expect(seedObjectTypes(prisma as never)).resolves.toEqual({ count: 5 });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
    expect(tx.objectType.findMany).toHaveBeenCalledWith({
      where: { key: { in: PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => preset.key) } },
      select: { key: true, isPreset: true },
    });
    expect(tx.objectType.create).toHaveBeenCalledTimes(5);
    expect(tx.objectType.update).not.toHaveBeenCalled();
  });

  it('既存presetはcanonical metadataへ更新し、fieldDefsやrecordsには触れない', async () => {
    const { prisma, tx } = makePrisma(
      PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => ({ key: preset.key, isPreset: true })),
    );

    await expect(seedObjectTypes(prisma as never)).resolves.toEqual({ count: 0 });
    expect(tx.objectType.create).not.toHaveBeenCalled();
    expect(tx.objectType.update).toHaveBeenCalledTimes(5);
    expect(tx.objectType.update).toHaveBeenCalledWith({
      where: { key: 'product' },
      data: { name: '商品', icon: 'package', sortOrder: 1, isPreset: true },
    });
  });

  it('non-presetの予約key衝突時は書込みを一切行わない', async () => {
    const { prisma, tx } = makePrisma([{ key: 'supplier', isPreset: false }]);

    await expect(seedObjectTypes(prisma as never)).rejects.toThrow('reserved key collision');
    expect(tx.objectType.create).not.toHaveBeenCalled();
    expect(tx.objectType.update).not.toHaveBeenCalled();
    expect(prisma.objectType.upsert).not.toHaveBeenCalled();
  });

  it('P2034はseed全体を先頭からbounded retryする', async () => {
    const { prisma, tx } = makePrisma();
    prisma.$transaction
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockImplementationOnce(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      );

    await expect(seedObjectTypes(prisma as never)).resolves.toEqual({ count: 5 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.objectType.findMany).toHaveBeenCalledTimes(1);
  });

  it('preset backfillとcustom demo ledgerは再実行しても冪等である', async () => {
    const { prisma, tx } = makePrisma();

    await seedObjectTypes(prisma as never);
    await seedObjectTypes(prisma as never);

    expect(tx.objectType.create).toHaveBeenCalledTimes(5);
    expect(tx.objectType.update).toHaveBeenCalledTimes(5);
    expect(prisma.objectType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'supplier-score' } }),
    );
    expect(prisma.objectType.upsert).toHaveBeenCalledTimes(2);
  });
});
