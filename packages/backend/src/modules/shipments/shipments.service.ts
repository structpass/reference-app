import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ShipmentStatus, AdjustmentType } from '@prisma/client';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { ok, okMessage } from '../../common/dto';
import { StocksService } from '../stocks/stocks.service';
import { ShipmentsRepository } from './repositories/shipments.repository';
import { toShipmentResponse } from './shipments.mapper';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { FindShipmentsDto } from './dto/find-shipments.dto';

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly repo: ShipmentsRepository,
    private readonly documentNumberService: DocumentNumberService,
    private readonly stocksService: StocksService,
  ) {}

  async findAll(query: FindShipmentsDto) {
    return this.repo.findManyPaginated(query);
  }

  async findAllForExport(query: FindShipmentsDto) {
    return this.repo.findManyForExport(query);
  }

  async findOne(id: number) {
    const shipment = await this.repo.findByIdWithRelations(id);

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    return ok(shipment);
  }

  async create(dto: CreateShipmentDto, userId: string) {
    const shipmentNo = await this.documentNumberService.generateShipmentNo();

    const shipment = await this.repo.create({
      shipmentNo,
      shipmentDate: new Date(dto.shipmentDate),
      warehouse: { connect: { id: dto.warehouseId } },
      destination: dto.destination,
      carrier: dto.carrierId ? { connect: { id: dto.carrierId } } : undefined,
      creator: { connect: { id: userId } },
      lines: {
        create: dto.lines.map((line) => ({
          lineNo: line.lineNo,
          productId: line.productId,
          plannedQty: line.plannedQty,
          actualQty: line.actualQty,
        })),
      },
    });

    return ok(shipment);
  }

  async update(id: number, dto: UpdateShipmentDto) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Shipment not found');
    }

    if (existing.status !== ShipmentStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT shipments can be updated');
    }

    const data: Record<string, unknown> = {};

    if (dto.shipmentDate) {
      data.shipmentDate = new Date(dto.shipmentDate);
    }
    if (dto.warehouseId !== undefined) {
      data.warehouse = { connect: { id: dto.warehouseId } };
    }
    if (dto.destination !== undefined) {
      data.destination = dto.destination;
    }
    if (dto.carrierId !== undefined) {
      data.carrier = { connect: { id: dto.carrierId } };
    }

    if (dto.lines) {
      data.lines = {
        create: dto.lines.map((line) => ({
          lineNo: line.lineNo,
          productId: line.productId,
          plannedQty: line.plannedQty,
          actualQty: line.actualQty,
        })),
      };
    }

    // 明細の全削除→再作成→親更新を単一トランザクションで束ねる。
    // 別トランザクションだと delete 成功・update 失敗時に明細が欠落する（CODE-H1）。
    // mapper は tx 外で適用しトランザクションを DB 操作だけに保つ（orders と統一）。
    const entity = await this.repo.runInTransaction(async (tx) => {
      if (dto.lines) {
        await this.repo.deleteLinesInTx(tx, id);
      }
      return this.repo.updateInTx(tx, id, data);
    });

    return ok(toShipmentResponse(entity));
  }

  async remove(id: number, userId: string) {
    const existing = await this.repo.findByIdWithLines(id);

    if (!existing) {
      throw new NotFoundException('Shipment not found');
    }

    if (existing.status === ShipmentStatus.CONFIRMED) {
      await this.repo.runInTransaction(async (tx) => {
        for (const line of existing.lines) {
          if (line.actualQty && line.actualQty > 0) {
            await this.stocksService.adjustStock(
              tx,
              existing.warehouseId,
              line.productId,
              line.actualQty,
              AdjustmentType.SHIPMENT,
              userId,
              `出荷取消: ${existing.shipmentNo}`,
            );
          }
        }

        await this.repo.softDeleteInTx(tx, id);
      });
    } else {
      await this.repo.softDelete(id);
    }

    return okMessage('Shipment deleted successfully');
  }

  async confirm(id: number, userId: string) {
    const existing = await this.repo.findByIdWithLines(id);

    if (!existing) {
      throw new NotFoundException('Shipment not found');
    }

    if (existing.status !== ShipmentStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT shipments can be confirmed');
    }

    const warnings: string[] = [];

    // 同一商品を含む並行 confirm が逆順でロックを奪い合うデッドロックを避けるため、
    // productId 昇順に固定したロック取得順序で在庫を更新する（並行整合性）。
    const sortedLines = [...existing.lines].sort((a, b) => a.productId.localeCompare(b.productId));

    const entity = await this.repo.runInTransaction(async (tx) => {
      for (const line of sortedLines) {
        const qty = line.actualQty ?? line.plannedQty;
        if (qty > 0) {
          // 在庫減算と在庫不足判定を同一の悲観ロック下で行う。adjustStock が FOR UPDATE
          // 取得後に読んだ quantityBefore を判定に使うことで、ロック外での在庫読み取りに
          // 起因する不正確な警告（CODE-H2: 同時 confirm でチェックが無意味化）を解消する。
          const { quantityBefore } = await this.stocksService.adjustStock(
            tx,
            existing.warehouseId,
            line.productId,
            -qty,
            AdjustmentType.SHIPMENT,
            userId,
            `出荷確定: ${existing.shipmentNo}`,
          );

          if (quantityBefore < qty) {
            warnings.push(
              `商品 ${line.productId}: 在庫不足 (現在庫: ${quantityBefore}, 出荷数: ${qty})`,
            );
          }
        }
      }

      // updateStatusInTx は Entity 保持 (tx 内低レベル) → mapper は tx 外で適用
      return this.repo.updateStatusInTx(tx, id, ShipmentStatus.CONFIRMED);
    });

    return {
      success: true,
      data: toShipmentResponse(entity),
      ...(warnings.length > 0 && { warnings }),
    };
  }

  async ship(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Shipment not found');
    }

    if (existing.status !== ShipmentStatus.CONFIRMED) {
      throw new BadRequestException('Only CONFIRMED shipments can be shipped');
    }

    const shipment = await this.repo.updateStatus(id, ShipmentStatus.SHIPPED);

    return ok(shipment);
  }
}
