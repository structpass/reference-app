import { PrismaClient, Product, Supplier } from '@prisma/client';
import { Rng, randomInt, pickRandom, randomSubset, randomDate, padNum } from './helpers';
import { Decimal } from '@prisma/client/runtime/library';

interface SeedOrdersParams {
  products: Product[];
  suppliers: Supplier[];
  userIds: string[];
  rng: Rng;
}

export async function seedOrders(prisma: PrismaClient, params: SeedOrdersParams) {
  const { products, suppliers, userIds, rng } = params;
  const FEB_START = new Date('2026-02-01');
  const FEB_END = new Date('2026-02-28');

  const pickStatus = () => {
    const r = rng();
    if (r < 0.1) return 'DRAFT' as const;
    if (r < 0.4) return 'ORDERED' as const;
    if (r < 0.6) return 'PARTIALLY_RECEIVED' as const;
    return 'COMPLETED' as const;
  };

  const TOTAL = 300;

  for (let i = 0; i < TOTAL; i++) {
    const status = pickStatus();
    const lineCount = randomInt(5, 10, rng);
    const lineProducts = randomSubset(products, lineCount, lineCount, rng);
    const orderDate = randomDate(FEB_START, FEB_END, rng);

    const hasDeliveryDate = rng() > 0.15;
    const deliveryOffset = randomInt(7, 30, rng);
    const desiredDeliveryDate = hasDeliveryDate
      ? new Date(orderDate.getTime() + deliveryOffset * 86400000)
      : null;

    let totalQty = 0;
    let totalAmount = new Decimal(0);

    const lineData = lineProducts.map((prod, idx) => {
      const qty = randomInt(1, 100, rng);
      const unitPrice = prod.purchasePrice ?? prod.price;
      const amount = new Decimal(unitPrice.toString()).mul(qty);
      totalQty += qty;
      totalAmount = totalAmount.add(amount);
      return {
        lineNo: idx + 1,
        productId: prod.id,
        orderQty: qty,
        unitPrice,
        amount,
      };
    });

    await prisma.order.create({
      data: {
        orderNo: `ORD-${padNum(i + 1, 4)}`,
        orderDate,
        supplierId: pickRandom(suppliers, rng).id,
        desiredDeliveryDate,
        status,
        totalQty,
        totalAmount,
        createdBy: pickRandom(userIds, rng),
        items: {
          createMany: { data: lineData },
        },
      },
    });
  }

  console.log('Orders created:', TOTAL);
}
