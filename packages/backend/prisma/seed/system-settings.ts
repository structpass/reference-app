import { PrismaClient } from '@prisma/client';

const SYSTEM_SETTINGS = [
  // システム設定
  // NOTE: app_name / sub_title は build-time の env (NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_SUBTITLE) に
  //       移行したためここでは持たない。既存 DB 行は migration `remove_branding_settings` で削除済。
  {
    key: 'system.ui.theme',
    value: 'default',
    valueType: 'STRING',
    label: 'UI カラーテーマ',
    description: '',
    category: 'system',
    sortOrder: 3,
  },
  // 一覧ページサイズ設定は table_pagination_settings テーブル（per-tableId）で管理。
  // /dashboard/list-preferences で SYS_ADMIN が編集する。ここには持たせない。
  // エクスポート設定（将来拡張用 placeholder。現状の UI / API はハードコード値を使用しており、
  // この key からは値を読み出していない。動的化を行うときに参照経路を組む想定で残置）
  {
    key: 'export.max_rows',
    value: '10000',
    valueType: 'NUMBER',
    label: 'エクスポート上限件数',
    description: 'Excel等へのエクスポート時の最大行数',
    category: 'export',
    sortOrder: 1,
  },
  // 掲示板設定
  {
    key: 'announcement.attachment.maxSizeMB',
    value: '20',
    valueType: 'NUMBER',
    label: '添付ファイル最大サイズ(MB)',
    description: '掲示板に添付できる1ファイルあたりの最大サイズ (1〜500)',
    category: 'announcement',
    sortOrder: 1,
  },
  {
    key: 'announcement.attachment.maxFiles',
    value: '4',
    valueType: 'NUMBER',
    label: '添付ファイル最大件数',
    description: '1件の掲示に添付できるファイルの最大件数',
    category: 'announcement',
    sortOrder: 2,
  },
  {
    key: 'announcement.attachment.allowedExtensions',
    value: 'pdf,png,jpg,jpeg,gif,webp,xlsx,docx,pptx,zip,csv,txt,md',
    valueType: 'STRING',
    label: '許可する添付拡張子',
    description: '掲示板の添付ファイルで許可する拡張子（カンマ区切り、ドット不要）',
    category: 'announcement',
    sortOrder: 3,
  },
];

export async function seedSystemSettings(prisma: PrismaClient) {
  console.log('Seeding system settings...');

  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        label: setting.label,
        description: setting.description,
        category: setting.category,
        sortOrder: setting.sortOrder,
        valueType: setting.valueType,
      },
      create: setting,
    });
  }

  console.log(`  ${SYSTEM_SETTINGS.length} system settings seeded.`);
}
