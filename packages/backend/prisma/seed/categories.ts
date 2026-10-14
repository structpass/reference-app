import { PrismaClient } from '@prisma/client';

const CATEGORY_DEFS = [
  { code: 'CAT-001', name: '電子機器' },
  { code: 'CAT-002', name: '周辺機器' },
  { code: 'CAT-003', name: 'ストレージ' },
  { code: 'CAT-004', name: 'ケーブル' },
  { code: 'CAT-005', name: 'オフィス用品' },
  { code: 'CAT-006', name: 'ネットワーク' },
  { code: 'CAT-007', name: '電源' },
  { code: 'CAT-008', name: '消耗品' },
  { code: 'CAT-009', name: 'オフィス家具' },
  { code: 'CAT-010', name: 'サーバー' },
  { code: 'CAT-011', name: 'セキュリティ' },
] as const;

export async function seedCategories(prisma: PrismaClient): Promise<Record<string, number>> {
  const categoryMap: Record<string, number> = {};
  for (const c of CATEGORY_DEFS) {
    const cat = await prisma.category.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, status: 'ACTIVE' },
    });
    categoryMap[c.name] = cat.id;
  }
  console.log('Categories created:', CATEGORY_DEFS.length);
  return categoryMap;
}
