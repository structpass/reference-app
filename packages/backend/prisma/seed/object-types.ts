import { PrismaClient, Prisma, type FieldType } from '@prisma/client';
import { PRESET_OBJECT_TYPE_DEFINITIONS } from '@struct-pass/shared';
import { runInSerializableTransaction } from '../../src/common/database/serializable-tx';

/**
 * 自由定義のデモ台帳（ref-0077/0078 の確認用）。プリセット以外の ObjectType 1 件と、
 * その項目定義 3 本（文字列・数値・日付）・データ 25 件程度を用意する。
 * 左メニューの動的表示（ref-0077）と共通一覧画面（ref-0078）の受け入れに使う。
 */
const DEMO_LEDGER = {
  key: 'supplier-score',
  name: '仕入先評価',
  icon: 'clipboard-check',
  sortOrder: 6,
  fields: [
    { key: 'name', label: '仕入先名', type: 'TEXT', required: true, sortOrder: 1 },
    { key: 'rating', label: '評価点', type: 'NUMBER', required: false, sortOrder: 2 },
    { key: 'reviewedOn', label: '評価日', type: 'DATE', required: false, sortOrder: 3 },
  ],
} as const satisfies {
  key: string;
  name: string;
  icon: string;
  sortOrder: number;
  fields: {
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    sortOrder: number;
  }[];
};

const DEMO_RECORD_COUNT = 25;

export async function seedObjectTypes(prisma: PrismaClient): Promise<Prisma.BatchPayload> {
  const result = await runInSerializableTransaction(prisma, async (tx) => {
    const existing = await tx.objectType.findMany({
      where: { key: { in: PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => preset.key) } },
      select: { key: true, isPreset: true },
    });

    const collisions = existing
      .filter((objectType) => !objectType.isPreset)
      .map((objectType) => objectType.key);
    if (collisions.length > 0) {
      throw new Error(
        `Cannot seed preset ObjectTypes: reserved key collision with non-preset row(s): ${collisions.join(', ')}`,
      );
    }

    let createdCount = 0;
    for (const preset of PRESET_OBJECT_TYPE_DEFINITIONS) {
      const current = existing.find((objectType) => objectType.key === preset.key);
      if (current) {
        await tx.objectType.update({
          where: { key: preset.key },
          data: {
            name: preset.name,
            icon: preset.icon,
            sortOrder: preset.sortOrder,
            isPreset: true,
          },
        });
      } else {
        await tx.objectType.create({
          data: {
            key: preset.key,
            name: preset.name,
            icon: preset.icon,
            sortOrder: preset.sortOrder,
            isPreset: true,
          },
        });
        createdCount += 1;
      }
    }

    return { count: createdCount };
  });
  console.log('ObjectType presets synchronized; created:', result.count);

  await seedDemoLedger(prisma);
  return result;
}

/** 自由定義のデモ台帳を upsert で投入する（再実行しても重複しない）。 */
async function seedDemoLedger(prisma: PrismaClient): Promise<void> {
  const type = await prisma.objectType.upsert({
    where: { key: DEMO_LEDGER.key },
    update: { name: DEMO_LEDGER.name, icon: DEMO_LEDGER.icon, sortOrder: DEMO_LEDGER.sortOrder },
    create: {
      key: DEMO_LEDGER.key,
      name: DEMO_LEDGER.name,
      icon: DEMO_LEDGER.icon,
      sortOrder: DEMO_LEDGER.sortOrder,
      isPreset: false,
    },
  });

  for (const f of DEMO_LEDGER.fields) {
    await prisma.fieldDef.upsert({
      where: { objectTypeId_key: { objectTypeId: type.id, key: f.key } },
      update: { label: f.label, type: f.type, required: f.required, sortOrder: f.sortOrder },
      create: {
        objectTypeId: type.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        sortOrder: f.sortOrder,
      },
    });
  }

  const existing = await prisma.customRecord.count({ where: { objectTypeId: type.id } });
  if (existing > 0) return;
  const base = new Date('2026-08-01T00:00:00.000Z');
  const records = Array.from({ length: DEMO_RECORD_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      objectTypeId: type.id,
      data: {
        name: `仕入先${String(n).padStart(2, '0')}`,
        rating: 60 + ((n * 7) % 40),
        reviewedOn: new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10),
      },
    };
  });
  await prisma.customRecord.createMany({ data: records });
  console.log(`Demo ledger '${DEMO_LEDGER.key}' seeded with ${DEMO_RECORD_COUNT} records`);
}
