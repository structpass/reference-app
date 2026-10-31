import { PrismaClient, Warehouse, Stock } from '@prisma/client';
import { Rng, randomInt, pickRandom } from './helpers';

const DIFFERENCE_REASONS = ['破損', '紛失', '数え間違い', '入出荷漏れ'];

interface SeedStocktakingsParams {
  warehouses: Warehouse[];
  stocks: Stock[];
  userIds: string[];
  rng: Rng;
}

export async function seedStocktakings(prisma: PrismaClient, params: SeedStocktakingsParams) {
  const { warehouses, stocks, userIds, rng } = params;
  const STOCKTAKING_DATE = new Date('2025-12-31');

  const stocksByWarehouse = new Map<number, Stock[]>();
  for (const s of stocks) {
    const arr = stocksByWarehouse.get(s.warehouseId) ?? [];
    arr.push(s);
    stocksByWarehouse.set(s.warehouseId, arr);
  }

  let count = 0;
  for (const wh of warehouses) {
    const whStocks = stocksByWarehouse.get(wh.id);
    if (!whStocks || whStocks.length === 0) continue;

    const items = whStocks.map((stock) => {
      const hasDifference = rng() < 0.1;
      const diff = hasDifference ? randomInt(-5, 5, rng) || 1 : 0;
      const actualQty = Math.max(0, stock.quantity + diff);
      const difference = actualQty - stock.quantity;

      return {
        productId: stock.productId,
        theoreticalQty: stock.quantity,
        actualQty,
        difference,
        differenceReason: difference !== 0 ? pickRandom(DIFFERENCE_REASONS, rng) : null,
      };
    });

    await prisma.stocktaking.create({
      data: {
        stocktakingDate: STOCKTAKING_DATE,
        warehouseId: wh.id,
        status: 'CONFIRMED',
        createdBy: pickRandom(userIds, rng),
        items: {
          createMany: { data: items },
        },
      },
    });
    count++;
  }

  console.log('Stocktakings created:', count);
}
