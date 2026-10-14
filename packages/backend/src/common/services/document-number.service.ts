import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  async generateReceivingNo(): Promise<string> {
    return this.generate('RCV', 4, async (prefix) => {
      const latest = await this.prisma.receiving.findFirst({
        where: { receivingNo: { startsWith: prefix } },
        orderBy: { receivingNo: 'desc' },
        select: { receivingNo: true },
      });
      return latest?.receivingNo ?? null;
    });
  }

  async generateShipmentNo(): Promise<string> {
    return this.generate('SHP', 4, async (prefix) => {
      const latest = await this.prisma.shipment.findFirst({
        where: { shipmentNo: { startsWith: prefix } },
        orderBy: { shipmentNo: 'desc' },
        select: { shipmentNo: true },
      });
      return latest?.shipmentNo ?? null;
    });
  }

  async generateOrderNo(): Promise<string> {
    return this.generate('PO', 3, async (prefix) => {
      const latest = await this.prisma.order.findFirst({
        where: { orderNo: { startsWith: prefix } },
        orderBy: { orderNo: 'desc' },
        select: { orderNo: true },
      });
      return latest?.orderNo ?? null;
    });
  }

  private async generate(
    type: string,
    seqLength: number,
    findLatest: (prefix: string) => Promise<string | null>,
  ): Promise<string> {
    const today = new Date();
    const dateStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('');

    const prefix = `${type}-${dateStr}-`;
    const latestNo = await findLatest(prefix);

    let seq = 1;
    if (latestNo) {
      const lastSeq = parseInt(latestNo.split('-').pop() ?? '0', 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(seqLength, '0')}`;
  }
}
