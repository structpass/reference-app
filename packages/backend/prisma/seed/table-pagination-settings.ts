import { PrismaClient } from '@prisma/client';
import { TABLE_IDS, type TableId } from '@struct-pass/shared';

/**
 * 一覧ごとのページサイズ設定の初期値。
 * 業務上の表示件数感に合わせて per-table で割り当てる。
 * 値の根拠: 件数規模と確認頻度（細かく見たい / ざっと見たい）。
 */
const DEFAULT_PAGINATION_SETTINGS: Record<
  TableId,
  { defaultPageSize: number; pageSizeOptions: string }
> = {
  products: { defaultPageSize: 50, pageSizeOptions: '20,50,100,200' },
  warehouses: { defaultPageSize: 20, pageSizeOptions: '10,20,50,100' },
  carriers: { defaultPageSize: 20, pageSizeOptions: '10,20,50,100' },
  suppliers: { defaultPageSize: 20, pageSizeOptions: '10,20,50,100' },
  categories: { defaultPageSize: 50, pageSizeOptions: '20,50,100,200' },
  users: { defaultPageSize: 50, pageSizeOptions: '20,50,100,200' },
  groups: { defaultPageSize: 20, pageSizeOptions: '10,20,50,100' },
  receivings: { defaultPageSize: 50, pageSizeOptions: '20,50,100,200' },
  shipments: { defaultPageSize: 50, pageSizeOptions: '20,50,100,200' },
  shipping: { defaultPageSize: 50, pageSizeOptions: '20,50,100,200' },
  stocktakings: { defaultPageSize: 20, pageSizeOptions: '10,20,50,100' },
  stocks: { defaultPageSize: 100, pageSizeOptions: '50,100,200,500' },
  forecast: { defaultPageSize: 100, pageSizeOptions: '50,100,200,500' },
  orders: { defaultPageSize: 50, pageSizeOptions: '20,50,100,200' },
};

export async function seedTablePaginationSettings(prisma: PrismaClient) {
  console.log('Seeding table pagination settings...');

  for (const tableId of TABLE_IDS) {
    const settings = DEFAULT_PAGINATION_SETTINGS[tableId];
    await prisma.tablePaginationSetting.upsert({
      where: { tableId },
      create: { tableId, ...settings },
      // upsert は seed 再実行時に既存値を上書きしない（admin が編集した値を尊重するため
      // update 句では何もしない）
      update: {},
    });
  }

  console.log(`  ${TABLE_IDS.length} table pagination settings seeded.`);
}
