import { PrismaClient, Warehouse } from '@prisma/client';

export async function seedWarehouses(
  prisma: PrismaClient,
  whAdminUsername: string,
): Promise<Warehouse[]> {
  const warehouseDefs = [
    {
      code: 'WH-TOKYO',
      name: '東京倉庫',
      address: '東京都江東区有明1-1-1',
      phone: '03-1234-5678',
      manager: whAdminUsername,
      capacity: 10000,
    },
    {
      code: 'WH-OSAKA',
      name: '大阪倉庫',
      address: '大阪府大阪市住之江区南港北1-1-1',
      phone: '06-1234-5678',
      capacity: 8000,
    },
    {
      code: 'WH-NAGOYA',
      name: '名古屋倉庫',
      address: '愛知県名古屋市港区金城ふ頭2-2',
      phone: '052-123-4567',
      capacity: 6000,
    },
    {
      code: 'WH-FUKUOKA',
      name: '福岡倉庫',
      address: '福岡県福岡市東区箱崎ふ頭4-1',
      phone: '092-123-4567',
      capacity: 5000,
    },
    {
      code: 'WH-SAPPORO',
      name: '札幌倉庫',
      address: '北海道札幌市白石区流通センター1-1',
      phone: '011-123-4567',
      capacity: 4000,
    },
    {
      code: 'WH-SENDAI',
      name: '仙台倉庫',
      address: '宮城県仙台市宮城野区港3-1',
      phone: '022-123-4567',
      capacity: 3500,
    },
    {
      code: 'WH-HIROSHIMA',
      name: '広島倉庫',
      address: '広島県広島市南区出島1-1',
      phone: '082-123-4567',
      capacity: 3000,
    },
    {
      code: 'WH-NIIGATA',
      name: '新潟倉庫',
      address: '新潟県新潟市東区臨港町1-1',
      phone: '025-123-4567',
      capacity: 2500,
    },
    {
      code: 'WH-SHIZUOKA',
      name: '静岡倉庫',
      address: '静岡県静岡市清水区袖師町1-1',
      phone: '054-123-4567',
      capacity: 3000,
    },
    {
      code: 'WH-KANAZAWA',
      name: '金沢倉庫',
      address: '石川県金沢市大野町4-1',
      phone: '076-123-4567',
      capacity: 2000,
    },
    {
      code: 'WH-KOBE',
      name: '神戸倉庫',
      address: '兵庫県神戸市中央区港島中町6-1',
      phone: '078-123-4567',
      capacity: 5500,
    },
    {
      code: 'WH-CHIBA',
      name: '千葉倉庫',
      address: '千葉県市川市塩浜3-1',
      phone: '047-123-4567',
      capacity: 7000,
    },
    {
      code: 'WH-YOKOHAMA',
      name: '横浜倉庫',
      address: '神奈川県横浜市鶴見区大黒ふ頭1-1',
      phone: '045-123-4567',
      capacity: 8000,
    },
    {
      code: 'WH-KYOTO',
      name: '京都倉庫',
      address: '京都府京都市伏見区横大路下三栖東ノ口1',
      phone: '075-123-4567',
      capacity: 2500,
    },
    {
      code: 'WH-OKAYAMA',
      name: '岡山倉庫',
      address: '岡山県岡山市南区築港新町1-1',
      phone: '086-123-4567',
      capacity: 2000,
    },
    {
      code: 'WH-NAHA',
      name: '那覇倉庫',
      address: '沖縄県那覇市港町2-1',
      phone: '098-123-4567',
      capacity: 1500,
    },
    {
      code: 'WH-MATSUYAMA',
      name: '松山倉庫',
      address: '愛媛県松山市三津ふ頭1-1',
      phone: '089-123-4567',
      capacity: 1500,
    },
    {
      code: 'WH-KAGOSHIMA',
      name: '鹿児島倉庫',
      address: '鹿児島県鹿児島市南栄5-1',
      phone: '099-123-4567',
      capacity: 2000,
    },
    {
      code: 'WH-NAGANO',
      name: '長野倉庫',
      address: '長野県長野市篠ノ井御幣川1-1',
      phone: '026-123-4567',
      capacity: 1800,
    },
    {
      code: 'WH-TAKASAKI',
      name: '高崎倉庫',
      address: '群馬県高崎市倉賀野町1-1',
      phone: '027-123-4567',
      capacity: 2500,
    },
  ];

  const warehouses: Warehouse[] = [];
  for (const w of warehouseDefs) {
    const wh = await prisma.warehouse.upsert({
      where: { code: w.code },
      update: {},
      create: { ...w, status: 'ACTIVE' },
    });
    warehouses.push(wh);
  }
  console.log('Warehouses created:', warehouses.length);
  return warehouses;
}
