import { PrismaClient, Supplier } from '@prisma/client';
import { padNum } from './helpers';

const STATIC_SUPPLIERS = [
  {
    code: 'SUP-001',
    name: '株式会社山田商事',
    address: '東京都千代田区丸の内1-1-1',
    phone: '03-1111-0001',
    contactPerson: '山田太郎',
    email: 'yamada@yamada-shoji.example',
  },
  {
    code: 'SUP-002',
    name: 'テクノパーツ株式会社',
    address: '大阪府大阪市北区梅田2-2-2',
    phone: '06-2222-0002',
    contactPerson: '佐藤花子',
    email: 'sato@technoparts.example',
  },
  {
    code: 'SUP-003',
    name: '東京エレクトロニクス',
    address: '東京都品川区東品川3-3-3',
    phone: '03-3333-0003',
    contactPerson: '鈴木一郎',
  },
  {
    code: 'SUP-004',
    name: '関西物産株式会社',
    address: '兵庫県神戸市中央区三宮町4-4',
    phone: '078-4444-0004',
    contactPerson: '田中美穂',
  },
  {
    code: 'SUP-005',
    name: 'グローバルIT商社',
    address: '東京都港区六本木5-5-5',
    phone: '03-5555-0005',
    contactPerson: '高橋健太',
    email: 'takahashi@globalit.example',
  },
  {
    code: 'SUP-006',
    name: '九州部品センター',
    address: '福岡県福岡市博多区博多駅前6-6',
    phone: '092-6666-0006',
    contactPerson: '中村洋子',
  },
  {
    code: 'SUP-007',
    name: '北海道サプライ',
    address: '北海道札幌市中央区大通西7-7',
    phone: '011-7777-0007',
    contactPerson: '渡辺翔',
  },
  {
    code: 'SUP-008',
    name: '中部電材株式会社',
    address: '愛知県名古屋市中区錦8-8',
    phone: '052-8888-0008',
    contactPerson: '伊藤誠',
    email: 'ito@chubu-denzai.example',
  },
  {
    code: 'SUP-009',
    name: 'デジタルワークス',
    address: '東京都渋谷区神宮前9-9-9',
    phone: '03-9999-0009',
    contactPerson: '小林愛',
  },
  {
    code: 'SUP-010',
    name: '東北マテリアル',
    address: '宮城県仙台市青葉区中央10-10',
    phone: '022-1010-0010',
    contactPerson: '加藤大輔',
  },
  {
    code: 'SUP-011',
    name: '横浜パシフィック貿易',
    address: '神奈川県横浜市中区海岸通11-1',
    phone: '045-1111-0011',
    contactPerson: '松本隆',
    email: 'matsumoto@ypacific.example',
  },
  {
    code: 'SUP-012',
    name: '四国電子部品',
    address: '香川県高松市番町12-1',
    phone: '087-1212-0012',
    contactPerson: '坂本恵',
  },
  {
    code: 'SUP-013',
    name: '信越テクノサプライ',
    address: '長野県長野市南千歳13-1',
    phone: '026-1313-0013',
    contactPerson: '吉田圭',
  },
  {
    code: 'SUP-014',
    name: 'アジアンパーツ株式会社',
    address: '大阪府堺市堺区戎島町14-1',
    phone: '072-1414-0014',
    contactPerson: '木村良子',
  },
  {
    code: 'SUP-015',
    name: '千葉ベイ商事',
    address: '千葉県千葉市美浜区中瀬15-1',
    phone: '043-1515-0015',
    contactPerson: '林正義',
    email: 'hayashi@chibabay.example',
  },
  {
    code: 'SUP-016',
    name: '日本オフィス機器',
    address: '東京都新宿区西新宿16-1',
    phone: '03-1616-0016',
    contactPerson: '清水明日香',
  },
  {
    code: 'SUP-017',
    name: 'エコサプライ株式会社',
    address: '京都府京都市下京区四条通17-1',
    phone: '075-1717-0017',
    contactPerson: '森田健一',
  },
  {
    code: 'SUP-018',
    name: '沖縄トロピカル物産',
    address: '沖縄県那覇市久茂地18-1',
    phone: '098-1818-0018',
    contactPerson: '比嘉真子',
  },
  {
    code: 'SUP-019',
    name: '北陸精密工業',
    address: '石川県金沢市広岡19-1',
    phone: '076-1919-0019',
    contactPerson: '前田剛',
  },
  {
    code: 'SUP-020',
    name: 'サンライズ商事',
    address: '広島県広島市中区紙屋町20-1',
    phone: '082-2020-0020',
    contactPerson: '岡田美咲',
    email: 'okada@sunrise.example',
  },
];

function generateExtraSuppliers(): typeof STATIC_SUPPLIERS {
  const regions = [
    '東京',
    '横浜',
    '大阪',
    '名古屋',
    '福岡',
    '札幌',
    '仙台',
    '広島',
    '神戸',
    '京都',
  ];
  const types = ['電子部品', '機械工業', 'オフィスサプライ', '通信機器'];
  const suffixes = ['株式会社', '有限会社', '合同会社', '商事'];
  const lastNames = [
    '佐藤',
    '田中',
    '高橋',
    '伊藤',
    '渡辺',
    '中村',
    '小林',
    '加藤',
    '吉田',
    '山口',
  ];
  const firstNames = ['太郎', '花子', '一郎', '美穂', '健太', '洋子', '翔', '誠', '愛', '大輔'];

  const extra: typeof STATIC_SUPPLIERS = [];
  for (let i = 21; i <= 60; i++) {
    const idx = i - 21;
    const region = regions[idx % regions.length];
    const type = types[idx % types.length];
    const suffix = suffixes[idx % suffixes.length];
    const lastName = lastNames[idx % lastNames.length];
    const firstName = firstNames[idx % firstNames.length];
    extra.push({
      code: `SUP-${padNum(i, 3)}`,
      name: `${region}${type}${suffix}`,
      address: `${region}都中央区${idx + 1}-${idx + 1}`,
      phone: `03-${padNum(i * 100, 4)}-${padNum(i, 4)}`,
      contactPerson: `${lastName}${firstName}`,
      email: i % 3 === 0 ? `contact${i}@supplier${i}.example` : (undefined as unknown as string),
    });
  }
  return extra;
}

export async function seedSuppliers(prisma: PrismaClient): Promise<Supplier[]> {
  const allDefs = [...STATIC_SUPPLIERS, ...generateExtraSuppliers()];
  const suppliers: Supplier[] = [];
  for (const s of allDefs) {
    const { email, ...rest } = s;
    const sup = await prisma.supplier.upsert({
      where: { code: s.code },
      update: {},
      create: { ...rest, ...(email ? { email } : {}), status: 'ACTIVE' },
    });
    suppliers.push(sup);
  }
  console.log('Suppliers created:', suppliers.length);
  return suppliers;
}
