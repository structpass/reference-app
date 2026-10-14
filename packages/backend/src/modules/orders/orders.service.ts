import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { DocumentNumberService } from '../../common/services/document-number.service';
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
    private readonly documentNumberService: DocumentNumberService,
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
    const orderNo = await this.documentNumberService.generateOrderNo();

    const items = dto.items.map((item) => ({
      lineNo: item.lineNo,
      productId: item.productId,
      orderQty: item.orderQty,
      unitPrice: new Prisma.Decimal(item.unitPrice),
      amount: new Prisma.Decimal(item.orderQty * item.unitPrice),
    }));

    const totalQty = items.reduce((sum, item) => sum + item.orderQty, 0);
    const totalAmount = items.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));

    const orderRecord = await this.repo.create({
      orderNo,
      orderDate: new Date(dto.orderDate),
      supplier: { connect: { id: dto.supplierId } },
      desiredDeliveryDate: dto.desiredDeliveryDate ? new Date(dto.desiredDeliveryDate) : undefined,
      totalQty,
      totalAmount,
      creator: { connect: { id: userId } },
      items: { create: items },
    });

    return ok(toOrderResponse(orderRecord));
  }

  async update(id: number, dto: UpdateOrderDto) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    if (existing.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be updated');
    }

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

    // 明細の全削除→再作成→親更新を単一トランザクションで束ねる。
    // 別トランザクションだと delete 成功・update 失敗時に明細が欠落し
    // totalQty/totalAmount だけ残る不整合が起きる（CODE-H1）。
    const orderRecord = await this.repo.runInTransaction(async (tx) => {
      if (dto.items) {
        await this.repo.deleteItemsInTx(tx, id);
      }
      return this.repo.updateInTx(tx, id, data);
    });

    return ok(toOrderResponse(orderRecord));
  }

  async remove(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    await this.repo.softDelete(id);

    return okMessage('Order deleted successfully');
  }

  async confirm(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    if (existing.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be confirmed');
    }

    const orderRecord = await this.repo.update(id, { status: OrderStatus.ORDERED });

    return ok(toOrderResponse(orderRecord));
  }
}
