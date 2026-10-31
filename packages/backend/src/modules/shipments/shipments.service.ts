import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ShipmentStatus, AdjustmentType } from '@prisma/client';
import { DocumentNumberRepository } from '../../common/repositories';
import { ok, okMessage } from '../../common/dto';
import { effectiveQty } from '../../common/helpers';
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
    private readonly documentNumberRepository: DocumentNumberRepository,
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
    // 採番と INSERT を単一トランザクションに閉じる。採番は tx 内で種別×日付の
    // advisory lock を取ってから行うため、並行作成でも番号が重複しない。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const shipmentNo = await this.documentNumberRepository.generateShipmentNo(tx);

      return this.repo.createInTx(tx, {
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
    });

    return ok(toShipmentResponse(entity));
  }

  async update(id: number, dto: UpdateShipmentDto) {
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

    // 文書行ロック→最新 status 判定→明細削除→親更新を単一トランザクションに閉じる。
    // ロック外の status 読み取りでは、並行 confirm と競合して「確定済みなのに更新」
    // が成立しうる（並行整合性）。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Shipment not found');
      }

      if (existing.status !== ShipmentStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT shipments can be updated');
      }

      if (dto.lines) {
        await this.repo.deleteLinesInTx(tx, id);
      }
      return this.repo.updateInTx(tx, id, data);
    });

    return ok(toShipmentResponse(entity));
  }

  async remove(id: number, userId: string) {
    // 文書行ロック→最新 status 判定→在庫逆計上→ソフトデリートを単一トランザクションに閉じる。
    await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Shipment not found');
      }

      if (existing.status === ShipmentStatus.CONFIRMED) {
        // 確定側と同じ productId 昇順で在庫ロックを取る。取消は「実績数が入っている行だけ」を
        // 逆計上していた頃より在庫ロックを取る行が増える（実績数を省略して確定した行も
        // 戻すため）ので、ロック取得順を確定と揃えておかないと逆順待ちの窓が広がる。
        const sortedLines = [...existing.lines].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        );

        for (const line of sortedLines) {
          // 確定（confirm）と同じ有効数量を逆符号（+）で戻す。実績数を省略して確定した
          // 伝票（actualQty=null）でも予定数ぶんが戻り、取消で在庫が元の数へ復る。
          // 明示 0 は 0 のままなので、確定で動かなかった伝票は取消でも動かない。
          const qty = effectiveQty(line);
          if (qty > 0) {
            await this.stocksService.adjustStock(
              tx,
              existing.warehouseId,
              line.productId,
              qty,
              AdjustmentType.SHIPMENT,
              userId,
              `出荷取消: ${existing.shipmentNo}`,
            );
          }
        }
      }

      await this.repo.softDeleteInTx(tx, id);
    });

    return okMessage('Shipment deleted successfully');
  }

  async confirm(id: number, userId: string) {
    const warnings: string[] = [];

    // 文書行ロック→最新 status 判定→在庫計上→状態確定を単一トランザクションに閉じる。
    // ロック後に読んだ status が DRAFT の時だけ計上するため、同一伝票の並行 confirm は
    // 2 件目が DRAFT 判定に失敗し、既存の業務エラー（BadRequestException）になる。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Shipment not found');
      }

      if (existing.status !== ShipmentStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT shipments can be confirmed');
      }

      // 同一商品を含む並行 confirm が逆順でロックを奪い合うデッドロックを避けるため、
      // productId 昇順に固定したロック取得順序で在庫を更新する（並行整合性）。
      const sortedLines = [...existing.lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      for (const line of sortedLines) {
        const qty = effectiveQty(line);
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
    // 文書行ロック→最新 status 判定→状態遷移を単一トランザクションに閉じる。
    // ロック後の status で判定するため、並行 confirm との競合で「未確定を出荷」にしない。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Shipment not found');
      }

      if (existing.status !== ShipmentStatus.CONFIRMED) {
        throw new BadRequestException('Only CONFIRMED shipments can be shipped');
      }

      return this.repo.updateStatusInTx(tx, id, ShipmentStatus.SHIPPED);
    });

    return ok(toShipmentResponse(entity));
  }
}
