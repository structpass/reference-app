import { PrismaClient, Carrier } from '@prisma/client';

export async function seedCarriers(prisma: PrismaClient): Promise<Carrier[]> {
  const carrierDefs = [
    { code: 'CR-YAMATO', name: 'ヤマト運輸', phone: '0120-01-9625', contactPerson: '山田太郎' },
    { code: 'CR-SAGAWA', name: '佐川急便', phone: '0120-18-9595', contactPerson: '佐川花子' },
    { code: 'CR-JPPOST', name: '日本郵便', phone: '0120-23-2886', contactPerson: '郵便次郎' },
    { code: 'CR-FUKUYAMA', name: '福山通運', phone: '0120-56-7890', contactPerson: '福山一郎' },
    { code: 'CR-SEINO', name: '西濃運輸', phone: '0120-22-4946', contactPerson: '西濃三郎' },
    { code: 'CR-TONAMI', name: 'トナミ運輸', phone: '076-432-3131', contactPerson: '砺波浩' },
    { code: 'CR-MEITETSU', name: '名鉄運輸', phone: '052-562-0391', contactPerson: '名鉄美穂' },
    { code: 'CR-HACOBELL', name: 'ハコベル', phone: '03-1111-2222', contactPerson: '箱田優' },
    {
      code: 'CR-SBS',
      name: 'SBSリコーロジスティクス',
      phone: '03-3333-4444',
      contactPerson: '高橋健',
    },
    { code: 'CR-NIPPONEXP', name: '日本通運', phone: '0120-21-0609', contactPerson: '通運花' },
    {
      code: 'CR-KINTETSU',
      name: '近鉄エクスプレス',
      phone: '03-6251-6100',
      contactPerson: '近藤進',
    },
    { code: 'CR-DHL', name: 'DHL Japan', phone: '0120-39-2580', contactPerson: 'David Lee' },
    { code: 'CR-FEDEX', name: 'FedEx Japan', phone: '0120-00-3200', contactPerson: 'Sarah Kim' },
    { code: 'CR-UPS', name: 'UPS Japan', phone: '0120-27-1040', contactPerson: 'Tom Brown' },
    { code: 'CR-MARUUN', name: '丸運', phone: '03-5543-5555', contactPerson: '丸山誠' },
    { code: 'CR-KANTSU', name: '関通', phone: '06-6555-6666', contactPerson: '関口博' },
    { code: 'CR-SUZUYO', name: '鈴与', phone: '054-354-3311', contactPerson: '鈴木洋' },
    {
      code: 'CR-KOKUSAI',
      name: '国際エキスプレス',
      phone: '03-7777-8888',
      contactPerson: '国際明',
    },
    {
      code: 'CR-AMAZON',
      name: 'Amazon Logistics',
      phone: '0120-99-9999',
      contactPerson: '物流太郎',
    },
    { code: 'CR-NITTSU', name: '日通商事', phone: '03-8888-9999', contactPerson: '日通健二' },
  ];

  const carriers: Carrier[] = [];
  for (const c of carrierDefs) {
    const carrier = await prisma.carrier.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, status: 'ACTIVE' },
    });
    carriers.push(carrier);
  }
  console.log('Carriers created:', carriers.length);
  return carriers;
}
