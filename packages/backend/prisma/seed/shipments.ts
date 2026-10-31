import { PrismaClient, Product, Warehouse, Carrier } from '@prisma/client';
import { Rng, randomInt, pickRandom, randomSubset, randomDate, padNum } from './helpers';

const DESTINATIONS = [
  '東京都千代田区丸の内1-1-1 丸の内ビル',
  '大阪府大阪市北区梅田3-1-1 大阪ステーションシティ',
  '愛知県名古屋市中村区名駅1-1-1 JPタワー名古屋',
  '福岡県福岡市博多区博多駅前2-1-1',
  '北海道札幌市中央区北5条西4丁目',
  '宮城県仙台市青葉区中央1-1-1',
  '広島県広島市中区基町6-78',
  '兵庫県神戸市中央区雲井通7-1-1',
  '京都府京都市下京区四条通烏丸東入長刀鉾町20',
  '新潟県新潟市中央区万代2-1-1',
  '石川県金沢市本町1-5-2',
  '静岡県静岡市葵区追手町9-6',
  '千葉県千葉市中央区新千葉1-1-1',
  '神奈川県横浜市西区高島2-19-12',
  '岡山県岡山市北区駅元町1-1',
  '沖縄県那覇市おもろまち4-12-20',
  '愛媛県松山市一番町4-4-2',
  '鹿児島県鹿児島市山下町15-1',
  '長野県長野市南長野幅下692-2',
  '群馬県高崎市栄町1-2',
  '栃木県宇都宮市本町12-1',
  '茨城県つくば市吾妻2-1-1',
  '山梨県甲府市丸の内1-6-1',
  '富山県富山市新総曲輪1-7',
  '福井県福井市大手3-17-1',
  '三重県津市広明町13',
  '滋賀県大津市京町4-1-1',
  '奈良県奈良市登大路町30',
  '和歌山県和歌山市小松原通1-1',
  '徳島県徳島市万代町1-1',
];

interface SeedShipmentsParams {
  products: Product[];
  warehouses: Warehouse[];
  carriers: Carrier[];
  userIds: string[];
  rng: Rng;
}

export async function seedShipments(prisma: PrismaClient, params: SeedShipmentsParams) {
  const { products, warehouses, carriers, userIds, rng } = params;
  const FEB_START = new Date('2026-02-01');
  const FEB_END = new Date('2026-02-28');

  const pickStatus = () => {
    const r = rng();
    if (r < 0.15) return 'DRAFT' as const;
    if (r < 0.4) return 'CONFIRMED' as const;
    return 'SHIPPED' as const;
  };

  const TOTAL = 400;

  for (let i = 0; i < TOTAL; i++) {
    const status = pickStatus();
    const lineCount = randomInt(5, 10, rng);
    const lineProducts = randomSubset(products, lineCount, lineCount, rng);
    const date = randomDate(FEB_START, FEB_END, rng);
    const hasCarrier = rng() > 0.1;

    await prisma.shipment.create({
      data: {
        shipmentNo: `SHP-${padNum(i + 1, 4)}`,
        shipmentDate: date,
        warehouseId: pickRandom(warehouses, rng).id,
        destination: pickRandom(DESTINATIONS, rng),
        carrierId: hasCarrier ? pickRandom(carriers, rng).id : null,
        status,
        createdBy: pickRandom(userIds, rng),
        lines: {
          createMany: {
            data: lineProducts.map((prod, idx) => {
              const plannedQty = randomInt(1, 50, rng);
              return {
                lineNo: idx + 1,
                productId: prod.id,
                plannedQty,
                actualQty: status === 'SHIPPED' ? plannedQty : null,
              };
            }),
          },
        },
      },
    });
  }

  console.log('Shipments created:', TOTAL);
}
