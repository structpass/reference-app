import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StocktakingStatus, AdjustmentType } from '@prisma/client';
import { ok, okMessage } from '../../common/dto';
import { StocksService } from '../stocks/stocks.service';
import { StocktakingsRepository } from './repositories/stocktakings.repository';
import { toStocktakingResponse } from './stocktakings.mapper';
import { CreateStocktakingDto } from './dto/create-stocktaking.dto';
import { UpdateStocktakingDto } from './dto/update-stocktaking.dto';
import { FindStocktakingsDto } from './dto/find-stocktakings.dto';

@Injectable()
export class StocktakingsService {
  constructor(
    private readonly repo: StocktakingsRepository,
    private readonly stocksService: StocksService,
  ) {}

  async findAll(query: FindStocktakingsDto) {
    return this.repo.findManyPaginated(query);
  }

  async findAllForExport(query: FindStocktakingsDto) {
    return this.repo.findManyForExport(query);
  }

  async findOne(id: number) {
    const stocktaking = await this.repo.findByIdWithRelations(id);

    if (!stocktaking) {
      throw new NotFoundException('Stocktaking not found');
    }

    return ok(stocktaking);
  }

  async create(dto: CreateStocktakingDto, userId: string) {
    const stocktaking = await this.repo.create({
      stocktakingDate: new Date(dto.stocktakingDate),
      warehouse: { connect: { id: dto.warehouseId } },
      stocktaker: dto.stocktaker,
      creator: { connect: { id: userId } },
      items: {
        create: dto.items.map((item) => ({
          productId: item.productId,
          theoreticalQty: item.theoreticalQty,
          actualQty: item.actualQty,
          difference: item.actualQty !== undefined ? item.actualQty - item.theoreticalQty : null,
          differenceReason: item.differenceReason,
        })),
      },
    });

    return ok(stocktaking);
  }

  async update(id: number, dto: UpdateStocktakingDto) {
    const data: Record<string, unknown> = {};

    if (dto.stocktakingDate) {
      data.stocktakingDate = new Date(dto.stocktakingDate);
    }
    if (dto.warehouseId !== undefined) {
      data.warehouse = { connect: { id: dto.warehouseId } };
    }
    if (dto.stocktaker !== undefined) {
      data.stocktaker = dto.stocktaker;
    }

    if (dto.items) {
      data.items = {
        create: dto.items.map((item) => ({
          productId: item.productId,
          theoreticalQty: item.theoreticalQty,
          actualQty: item.actualQty,
          difference: item.actualQty !== undefined ? item.actualQty - item.theoreticalQty : null,
          differenceReason: item.differenceReason,
        })),
      };
    }

    // 文書行ロック→最新 status 判定→明細削除→親更新を単一トランザクションに閉じる。
    // ロック外の status 読み取りでは、並行 confirm と競合して「確定済みなのに更新」
    // が成立しうる（並行整合性）。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithItemsInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Stocktaking not found');
      }

      if (existing.status !== StocktakingStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT stocktakings can be updated');
      }

      if (dto.items) {
        await this.repo.deleteItemsInTx(tx, id);
      }
      return this.repo.updateInTx(tx, id, data);
    });

    return ok(toStocktakingResponse(entity));
  }

  async remove(id: number) {
    // 文書行ロック→最新 status 判定→削除を単一トランザクションに閉じる。
    await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithItemsInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Stocktaking not found');
      }

      if (existing.status !== StocktakingStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT stocktakings can be deleted');
      }

      // 親の物理削除による実績明細の連鎖削除は DB で拒否する。
      // 下書きだけ、ロック後の状態確認を通して子→親の順で明示削除する。
      await this.repo.deleteItemsInTx(tx, id);
      await this.repo.deleteInTx(tx, id);
    });

    return okMessage('Stocktaking deleted successfully');
  }

  async confirm(id: number, userId: string) {
    // 文書行ロック→最新 status 判定→在庫上書き→状態確定を単一トランザクションに閉じる。
    // ロック後に読んだ status が DRAFT の時だけ計上するため、同一伝票の並行 confirm は
    // 2 件目が DRAFT 判定に失敗し、既存の業務エラー（BadRequestException）になる。
    const entity = await this.repo.runInTransaction(async (tx) => {
      const existing = await this.repo.lockByIdWithItemsInTx(tx, id);

      if (!existing) {
        throw new NotFoundException('Stocktaking not found');
      }

      if (existing.status !== StocktakingStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT stocktakings can be confirmed');
      }

      // 同一商品を含む並行 confirm が逆順でロックを奪い合うデッドロックを避けるため、
      // productId 昇順に固定したロック取得順序で在庫を更新する（並行整合性）。
      const sortedItems = [...existing.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      for (const item of sortedItems) {
        if (item.actualQty !== null) {
          await this.stocksService.overwriteStock(
            tx,
            existing.warehouseId,
            item.productId,
            item.actualQty,
            AdjustmentType.STOCKTAKING,
            userId,
            `棚卸確定: ID=${existing.id}`,
          );
        }
      }

      // updateStatusInTx は Entity 保持 (tx 内低レベル) → mapper は tx 外で適用
      return this.repo.updateStatusInTx(tx, id, StocktakingStatus.CONFIRMED);
    });

    return ok(toStocktakingResponse(entity));
  }
}
