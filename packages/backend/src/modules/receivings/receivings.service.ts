import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReceivingStatus, AdjustmentType } from '@prisma/client';
import { DocumentNumberRepository } from '../../common/repositories';
import { ok, okMessage } from '../../common/dto';
import { effectiveQty } from '../../common/helpers';
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
    private readonly documentNumberRepository: DocumentNumberRepository,
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
    // 採番と INSERT を単一トランザクションに閉じる。採番は tx 内で種別×日付の
    // advisory lock を取ってから行うため、並行作成でも番号が重複しない。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const receivingNo = await this.documentNumberRepository.generateReceivingNo(tx);

      return this.repo.createInTx(tx, {
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
    });

    return ok(toReceivingResponse(entity));
  }

  async update(id: number, dto: UpdateReceivingDto) {
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

    // 文書行ロック→最新 status 判定→明細削除→親更新を単一トランザクションに閉じる。
    // ロック外の status 読み取りでは、並行 confirm と競合して「確定済みなのに更新」
    // が成立しうる（並行整合性）。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Receiving not found');
      }

      if (existing.status !== ReceivingStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT receivings can be updated');
      }

      if (dto.lines) {
        await this.repo.deleteLinesInTx(tx, id);
      }
      return this.repo.updateInTx(tx, id, data);
    });

    return ok(toReceivingResponse(entity));
  }

  async remove(id: number, userId: string) {
    // 文書行ロック→最新 status 判定→在庫逆計上→ソフトデリートを単一トランザクションに閉じる。
    await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Receiving not found');
      }

      if (existing.status === ReceivingStatus.CONFIRMED) {
        // 確定側と同じ productId 昇順で在庫ロックを取る。取消は「実績数が入っている行だけ」を
        // 逆計上していた頃より在庫ロックを取る行が増える（実績数を省略して確定した行も
        // 戻すため）ので、ロック取得順を確定と揃えておかないと逆順待ちの窓が広がる。
        const sortedLines = [...existing.lines].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        );

        for (const line of sortedLines) {
          // 確定（confirm）と同じ有効数量を逆符号で戻す。実績数を省略して確定した伝票
          // （actualQty=null）でも予定数ぶんが戻り、取消で在庫が元の数へ復る。
          // 明示 0 は 0 のままなので、確定で動かなかった伝票は取消でも動かない。
          const qty = effectiveQty(line);
          if (qty > 0) {
            await this.stocksService.adjustStock(
              tx,
              existing.warehouseId,
              line.productId,
              -qty,
              AdjustmentType.RECEIVING,
              userId,
              `入荷取消: ${existing.receivingNo}`,
            );
          }
        }
      }

      await this.repo.softDeleteInTx(tx, id);
    });

    return okMessage('Receiving deleted successfully');
  }

  async confirm(id: number, userId: string) {
    // 文書行ロック→最新 status 判定→在庫計上→状態確定を単一トランザクションに閉じる。
    // ロック後に読んだ status が DRAFT の時だけ計上するため、同一伝票の並行 confirm は
    // 2 件目が DRAFT 判定に失敗し、既存の業務エラー（BadRequestException）になる。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Receiving not found');
      }

      if (existing.status !== ReceivingStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT receivings can be confirmed');
      }

      // 同一商品を含む並行 confirm が逆順でロックを奪い合うデッドロックを避けるため、
      // productId 昇順に固定したロック取得順序で在庫を更新する（並行整合性）。
      const sortedLines = [...existing.lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      for (const line of sortedLines) {
        const qty = effectiveQty(line);
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
    // 文書行ロック→最新 status 判定→状態完了を単一トランザクションに閉じる。
    // ロック後の status で判定するため、並行 confirm との競合で「未確定を完了」にしない。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithLinesInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Receiving not found');
      }

      if (existing.status !== ReceivingStatus.CONFIRMED) {
        throw new BadRequestException('Only CONFIRMED receivings can be completed');
      }

      return this.repo.updateStatusInTx(tx, id, ReceivingStatus.COMPLETED);
    });

    return ok(toReceivingResponse(entity));
  }
}
