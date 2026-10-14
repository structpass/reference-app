import { PrismaClient, Warehouse, Product, Stock } from '@prisma/client';
import { Rng, randomInt, randomSubset } from './helpers';

export async function seedStocks(
  prisma: PrismaClient,
  warehouses: Warehouse[],
  products: Product[],
  rng: Rng,
): Promise<Stock[]> {
  const stockData: { warehouseId: number; productId: string; quantity: number }[] = [];

  for (const wh of warehouses) {
    const subset = randomSubset(products, 100, 300, rng);
    for (const prod of subset) {
      stockData.push({
        warehouseId: wh.id,
        productId: prod.id,
        quantity: randomInt(5, 500, rng),
      });
    }
  }

  const BATCH = 500;
  for (let i = 0; i < stockData.length; i += BATCH) {
    await prisma.stock.createMany({
      data: stockData.slice(i, i + BATCH),
      skipDuplicates: true,
    });
  }

  const stocks = await prisma.stock.findMany();
  console.log('Stocks created:', stocks.length);
  return stocks;
}
