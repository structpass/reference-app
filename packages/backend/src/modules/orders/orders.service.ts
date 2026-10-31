import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { DocumentNumberRepository } from '../../common/repositories';
import { ok, okMessage } from '../../common/dto';
import { OrdersRepository } from './repositories/orders.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { FindOrdersDto } from './dto/find-orders.dto';
import { toOrderResponse } from './orders.mapper';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly documentNumberRepository: DocumentNumberRepository,
  ) {}

  async findAll(query: FindOrdersDto) {
    return this.repo.findManyPaginated(query);
  }

  async findAllForExport(query: FindOrdersDto) {
    return this.repo.findManyForExport(query);
  }

  async findOne(id: number) {
    const orderRecord = await this.repo.findByIdWithRelations(id);

    if (!orderRecord) {
      throw new NotFoundException('Order not found');
    }

    return ok(toOrderResponse(orderRecord));
  }

  async create(dto: CreateOrderDto, userId: string) {
    const items = dto.items.map((item) => ({
      lineNo: item.lineNo,
      productId: item.productId,
      orderQty: item.orderQty,
      unitPrice: new Prisma.Decimal(item.unitPrice),
      amount: new Prisma.Decimal(item.orderQty * item.unitPrice),
    }));

    const totalQty = items.reduce((sum, item) => sum + item.orderQty, 0);
    const totalAmount = items.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));

    // 採番と INSERT を単一トランザクションに閉じる。採番は tx 内で種別×日付の
    // advisory lock を取ってから行うため、並行作成でも番号が重複しない。
    const orderRecord = await this.repo.runInTransaction(async (tx) => {
      const orderNo = await this.documentNumberRepository.generateOrderNo(tx);

      return this.repo.createInTx(tx, {
        orderNo,
        orderDate: new Date(dto.orderDate),
        supplier: { connect: { id: dto.supplierId } },
        desiredDeliveryDate: dto.desiredDeliveryDate
          ? new Date(dto.desiredDeliveryDate)
          : undefined,
        totalQty,
        totalAmount,
        creator: { connect: { id: userId } },
        items: { create: items },
      });
    });

    return ok(toOrderResponse(orderRecord));
  }

  async update(id: number, dto: UpdateOrderDto) {
    const data: Prisma.OrderUpdateInput = {};

    if (dto.orderDate) {
      data.orderDate = new Date(dto.orderDate);
    }
    if (dto.supplierId !== undefined) {
      data.supplier = { connect: { id: dto.supplierId } };
    }
    if (dto.desiredDeliveryDate !== undefined) {
      data.desiredDeliveryDate = dto.desiredDeliveryDate ? new Date(dto.desiredDeliveryDate) : null;
    }

    if (dto.items) {
      const items = dto.items.map((item) => ({
        lineNo: item.lineNo,
        productId: item.productId,
        orderQty: item.orderQty,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        amount: new Prisma.Decimal(item.orderQty * item.unitPrice),
      }));

      const totalQty = items.reduce((sum, item) => sum + item.orderQty, 0);
      const totalAmount = items.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));

      data.totalQty = totalQty;
      data.totalAmount = totalAmount;
      data.items = { create: items };
    }

    // ロック後の最新状態を確認してから、明細の全削除→再作成→親更新を原子化する。
    // 確定と競合しても、確定済みの明細を置換しない。
    const orderRecord = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdInTx(tx, id);
      if (!existing) {
        throw new NotFoundException('Order not found');
      }
      if (existing.status !== OrderStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT orders can be updated');
      }
      if (dto.items) {
        await this.repo.deleteItemsInTx(tx, id);
      }
      return this.repo.updateInTx(tx, id, data);
    });

    return ok(toOrderResponse(orderRecord));
  }

  async remove(id: number) {
    await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdInTx(tx, id);
      if (!existing) {
        throw new NotFoundException('Order not found');
      }
      await this.repo.softDeleteInTx(tx, id);
    });

    return okMessage('Order deleted successfully');
  }

  async confirm(id: number) {
    const orderRecord = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdInTx(tx, id);
      if (!existing) {
        throw new NotFoundException('Order not found');
      }
      if (existing.status !== OrderStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT orders can be confirmed');
      }
      return this.repo.updateInTx(tx, id, { status: OrderStatus.ORDERED });
    });

    return ok(toOrderResponse(orderRecord));
  }
}
