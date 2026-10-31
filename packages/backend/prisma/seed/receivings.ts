import { PrismaClient, Product, Warehouse, Supplier } from '@prisma/client';
import { Rng, randomInt, pickRandom, randomSubset, randomDate, padNum } from './helpers';

interface SeedReceivingsParams {
  products: Product[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
  userIds: string[];
  rng: Rng;
}

export async function seedReceivings(prisma: PrismaClient, params: SeedReceivingsParams) {
  const { products, warehouses, suppliers, userIds, rng } = params;
  const FEB_START = new Date('2026-02-01');
  const FEB_END = new Date('2026-02-28');
  const STATUSES = ['DRAFT', 'CONFIRMED', 'COMPLETED'] as const;
  const STATUS_WEIGHTS = [0.2, 0.3, 0.5]; // cumulative: 0.2, 0.5, 1.0

  const pickStatus = () => {
    const r = rng();
    if (r < STATUS_WEIGHTS[0]) return STATUSES[0];
    if (r < STATUS_WEIGHTS[0] + STATUS_WEIGHTS[1]) return STATUSES[1];
    return STATUSES[2];
  };

  const TOTAL = 500;
  const BATCH = 50;

  for (let batch = 0; batch < TOTAL; batch += BATCH) {
    const end = Math.min(batch + BATCH, TOTAL);
    for (let i = batch; i < end; i++) {
      const status = pickStatus();
      const lineCount = randomInt(5, 10, rng);
      const lineProducts = randomSubset(products, lineCount, lineCount, rng);
      const date = randomDate(FEB_START, FEB_END, rng);

      await prisma.receiving.create({
        data: {
          receivingNo: `RCV-${padNum(i + 1, 4)}`,
          receivingDate: date,
          warehouseId: pickRandom(warehouses, rng).id,
          supplierId: pickRandom(suppliers, rng).id,
          status,
          createdBy: pickRandom(userIds, rng),
          lines: {
            createMany: {
              data: lineProducts.map((prod, idx) => {
                const plannedQty = randomInt(1, 100, rng);
                return {
                  lineNo: idx + 1,
                  productId: prod.id,
                  plannedQty,
                  actualQty: status === 'COMPLETED' ? plannedQty + randomInt(-3, 3, rng) : null,
                };
              }),
            },
          },
        },
      });
    }
  }

  console.log('Receivings created:', TOTAL);
}
