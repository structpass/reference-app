import { PrismaClient, Group } from '@prisma/client';

const GROUP_DEFS = [
  { code: 'GRP-WH', name: '倉庫チーム', description: '倉庫業務担当グループ' },
  { code: 'GRP-OF', name: '事務チーム', description: '事務業務担当グループ' },
  { code: 'GRP-IT', name: 'ITチーム', description: '情報システム担当' },
  { code: 'GRP-SALES', name: '営業チーム', description: '営業・受注担当' },
  { code: 'GRP-PURCHASE', name: '購買チーム', description: '仕入・発注担当' },
  { code: 'GRP-QC', name: '品質管理チーム', description: '品質検査担当' },
  { code: 'GRP-LOGISTICS', name: '物流チーム', description: '物流・配送管理' },
  { code: 'GRP-ACCOUNTS', name: '経理チーム', description: '経理・決算担当' },
  { code: 'GRP-HR', name: '人事チーム', description: '人事・採用担当' },
  { code: 'GRP-PLANNING', name: '企画チーム', description: '企画・戦略担当' },
  { code: 'GRP-CS', name: 'CSチーム', description: 'カスタマーサポート' },
  { code: 'GRP-MAINT', name: '保守チーム', description: '設備保守担当' },
  { code: 'GRP-SAFETY', name: '安全管理チーム', description: '安全衛生担当' },
  { code: 'GRP-TRAINING', name: '研修チーム', description: '教育・研修担当' },
  { code: 'GRP-AUDIT', name: '監査チーム', description: '内部監査担当' },
  { code: 'GRP-LEGAL', name: '法務チーム', description: '法務・コンプライアンス' },
  { code: 'GRP-EXPORT', name: '輸出チーム', description: '海外出荷担当' },
  { code: 'GRP-IMPORT', name: '輸入チーム', description: '海外仕入担当' },
  { code: 'GRP-STOCK', name: '在庫管理チーム', description: '在庫棚卸担当' },
  { code: 'GRP-RETURN', name: '返品チーム', description: '返品処理担当' },
];

export async function seedGroups(prisma: PrismaClient): Promise<Group[]> {
  const groups: Group[] = [];
  for (const g of GROUP_DEFS) {
    const grp = await prisma.group.upsert({
      where: { code: g.code },
      update: {},
      create: { ...g, status: 'ACTIVE' },
    });
    groups.push(grp);
  }
  console.log('Groups created:', groups.length);
  return groups;
}

export async function seedUserGroups(
  prisma: PrismaClient,
  users: {
    whUser: { id: string };
    whAdmin: { id: string };
    ofUser: { id: string };
    ofAdmin: { id: string };
    tanaka: { id: string };
  },
  groups: Group[],
) {
  const pairs = [
    { userId: users.whUser.id, groupId: groups[0].id },
    { userId: users.whAdmin.id, groupId: groups[0].id },
    { userId: users.ofUser.id, groupId: groups[1].id },
    { userId: users.ofAdmin.id, groupId: groups[1].id },
    { userId: users.tanaka.id, groupId: groups[0].id },
    { userId: users.tanaka.id, groupId: groups[6].id },
  ];
  for (const pair of pairs) {
    await prisma.userGroup.upsert({
      where: { userId_groupId: { userId: pair.userId, groupId: pair.groupId } },
      update: {},
      create: pair,
    });
  }
  console.log('UserGroups created:', pairs.length);
}
