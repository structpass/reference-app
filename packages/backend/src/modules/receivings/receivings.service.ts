import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReceivingStatus, AdjustmentType } from '@prisma/client';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { ok, okMessage } from '../../common/dto';
import { StocksService } from '../stocks/stocks.service';
import { ReceivingsRepository } from './repositories/receivings.repository';
import { toReceivingResponse } from './receivings.mapper';
import { CreateReceivingDto } from './dto/create-receiving.dto';
import { UpdateReceivingDto } from './dto/update-receiving.dto';
import { FindReceivingsDto } from './dto/find-receivings.dto';

@Injectable()
export class ReceivingsService {
  constructor(
    private readonly repo: ReceivingsRepository,
    private readonly documentNumberService: DocumentNumberService,
    private readonly stocksService: StocksService,
  ) {}

  async findAll(query: FindReceivingsDto) {
    return this.repo.findManyPaginated(query);
  }

  async findAllForExport(query: FindReceivingsDto) {
    return this.repo.findManyForExport(query);
  }

  async findOne(id: number) {
    const receiving = await this.repo.findByIdWithRelations(id);

    if (!receiving) {
      throw new NotFoundException('Receiving not found');
    }

    return ok(receiving);
  }

  async create(dto: CreateReceivingDto, userId: string) {
    const receivingNo = await this.documentNumberService.generateReceivingNo();

    const receiving = await this.repo.create({
      receivingNo,
      receivingDate: new Date(dto.receivingDate),
      warehouse: { connect: { id: dto.warehouseId } },
      supplier: { connect: { id: dto.supplierId } },
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

    return ok(receiving);
  }

  async update(id: number, dto: UpdateReceivingDto) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Receiving not found');
    }

    if (existing.status !== ReceivingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT receivings can be updated');
    }

    const data: Record<string, unknown> = {};

    if (dto.receivingDate) {
      data.receivingDate = new Date(dto.receivingDate);
    }
    if (dto.warehouseId !== undefined) {
      data.warehouse = { connect: { id: dto.warehouseId } };
    }
    if (dto.supplierId !== undefined) {
      data.supplier = { connect: { id: dto.supplierId } };
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

    return ok(toReceivingResponse(entity));
  }

  async remove(id: number, userId: string) {
    const existing = await this.repo.findByIdWithLines(id);

    if (!existing) {
      throw new NotFoundException('Receiving not found');
    }

    if (existing.status === ReceivingStatus.CONFIRMED) {
      await this.repo.runInTransaction(async (tx) => {
        for (const line of existing.lines) {
          if (line.actualQty && line.actualQty > 0) {
            await this.stocksService.adjustStock(
              tx,
              existing.warehouseId,
              line.productId,
              -line.actualQty,
              AdjustmentType.RECEIVING,
              userId,
              `入荷取消: ${existing.receivingNo}`,
            );
          }
        }

        await this.repo.softDeleteInTx(tx, id);
      });
    } else {
      await this.repo.softDelete(id);
    }

    return okMessage('Receiving deleted successfully');
  }

  async confirm(id: number, userId: string) {
    const existing = await this.repo.findByIdWithLines(id);

    if (!existing) {
      throw new NotFoundException('Receiving not found');
    }

    if (existing.status !== ReceivingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT receivings can be confirmed');
    }

    // 同一商品を含む並行 confirm が逆順でロックを奪い合うデッドロックを避けるため、
    // productId 昇順に固定したロック取得順序で在庫を更新する（並行整合性）。
    const sortedLines = [...existing.lines].sort((a, b) => a.productId.localeCompare(b.productId));

    const entity = await this.repo.runInTransaction(async (tx) => {
      for (const line of sortedLines) {
        const qty = line.actualQty ?? line.plannedQty;
        if (qty > 0) {
          await this.stocksService.adjustStock(
            tx,
            existing.warehouseId,
            line.productId,
            qty,
            AdjustmentType.RECEIVING,
            userId,
            `入荷確定: ${existing.receivingNo}`,
          );
        }
      }

      // updateStatusInTx は Entity 保持 (tx 内低レベル) → mapper は tx 外で適用
      return this.repo.updateStatusInTx(tx, id, ReceivingStatus.CONFIRMED);
    });

    return ok(toReceivingResponse(entity));
  }

  async complete(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Receiving not found');
    }

    if (existing.status !== ReceivingStatus.CONFIRMED) {
      throw new BadRequestException('Only CONFIRMED receivings can be completed');
    }

    const receiving = await this.repo.updateStatus(id, ReceivingStatus.COMPLETED);

    return ok(receiving);
  }
}
