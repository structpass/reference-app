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
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Stocktaking not found');
    }

    if (existing.status !== StocktakingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT stocktakings can be updated');
    }

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

    // 明細の全削除→再作成→親更新を単一トランザクションで束ねる。
    // 別トランザクションだと delete 成功・update 失敗時に明細が欠落する（CODE-H1）。
    // mapper は tx 外で適用しトランザクションを DB 操作だけに保つ（orders と統一）。
    const entity = await this.repo.runInTransaction(async (tx) => {
      if (dto.items) {
        await this.repo.deleteItemsInTx(tx, id);
      }
      return this.repo.updateInTx(tx, id, data);
    });

    return ok(toStocktakingResponse(entity));
  }

  async remove(id: number) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Stocktaking not found');
    }

    if (existing.status !== StocktakingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT stocktakings can be deleted');
    }

    await this.repo.delete(id);

    return okMessage('Stocktaking deleted successfully');
  }

  async confirm(id: number, userId: string) {
    const existing = await this.repo.findByIdWithItems(id);

    if (!existing) {
      throw new NotFoundException('Stocktaking not found');
    }

    if (existing.status !== StocktakingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT stocktakings can be confirmed');
    }

    // 同一商品を含む並行 confirm が逆順でロックを奪い合うデッドロックを避けるため、
    // productId 昇順に固定したロック取得順序で在庫を更新する（並行整合性）。
    const sortedItems = [...existing.items].sort((a, b) => a.productId.localeCompare(b.productId));

    const entity = await this.repo.runInTransaction(async (tx) => {
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
