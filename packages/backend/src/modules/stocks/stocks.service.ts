import { Injectable } from '@nestjs/common';
import { Prisma, AdjustmentType } from '@prisma/client';
import { okPaginated, buildPaginatedMeta } from '../../common/dto';
import { StocksRepository, forecastKey } from './repositories/stocks.repository';
import { toForecastStockResponse } from './stocks.mapper';
import { StockForecastResponseDto, ForecastAlert } from './dto/stock-response.dto';
import { FindStocksDto } from './dto/find-stocks.dto';
import { FindForecastDto } from './dto/find-forecast.dto';

/** エクスポート時に一括取得する最大行数（ページング上限の代替）。 */
const MAX_EXPORT_ROWS = 10000;

/** 在庫過剰（surplus）と判定する予測在庫の現在在庫に対する業務閾値倍率。 */
const SURPLUS_MULTIPLIER = 3;

@Injectable()
export class StocksService {
  constructor(private readonly repo: StocksRepository) {}

  async findAll(query: FindStocksDto) {
    return this.repo.findManyPaginated(query);
  }

  async findAllForExport(query: FindStocksDto) {
    return this.repo.findManyForExport(query);
  }

  async adjustStock(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    productId: string,
    quantityDelta: number,
    adjustmentType: AdjustmentType,
    createdBy: string,
    reason?: string,
  ) {
    // 悲観ロックで現在値を安全に取得（race condition防止）
    const locked = await this.repo.lockStockForUpdate(tx, warehouseId, productId);

    const quantityBefore = locked.length > 0 ? locked[0].quantity : 0;
    const quantityAfter = quantityBefore + quantityDelta;

    await this.repo.upsertStockIncrement(tx, warehouseId, productId, quantityDelta, quantityAfter);

    await this.repo.createAdjustment(tx, {
      warehouseId,
      productId,
      adjustmentType,
      quantityBefore,
      quantityAfter,
      reason,
      createdBy,
    });

    return { quantityBefore, quantityAfter };
  }

  async overwriteStock(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    productId: string,
    newQuantity: number,
    adjustmentType: AdjustmentType,
    createdBy: string,
    reason?: string,
  ) {
    // 排他ロック取得（競合防止）。ロック済みの現在値をそのまま使い、ロック後の
    // 追加読み取り（findStockInTx）は行わない。adjustStock と同じ経路に統一し、
    // 「ロック外/ロック後の別読み取り」という race を招く面を残さない。
    const locked = await this.repo.lockStockForUpdate(tx, warehouseId, productId);
    const quantityBefore = locked.length > 0 ? locked[0].quantity : 0;

    await this.repo.upsertStockOverwrite(tx, warehouseId, productId, newQuantity);

    await this.repo.createAdjustment(tx, {
      warehouseId,
      productId,
      adjustmentType,
      quantityBefore,
      quantityAfter: newQuantity,
      reason,
      createdBy,
    });

    return { quantityBefore, quantityAfter: newQuantity };
  }

  async getForecast(query: FindForecastDto) {
    const { stocks, total, page, limit } = await this.repo.findManyForForecast(query);

    // CODE-M2: stock ごとの 2 クエリ（N+1）を、ページ全体の productId 集合に対する
    // 2 クエリ（入荷/出荷の一括集計）へ畳む。結果はキー引きで O(1) に解決する。
    const productIds = [...new Set(stocks.map((s) => s.product.id))];
    const [incomingByKey, outgoingByKey] = await Promise.all([
      this.repo.aggregatePendingReceivingByKey(productIds),
      this.repo.aggregatePendingShipmentByKey(productIds),
    ]);

    const data: StockForecastResponseDto[] = stocks.map((stock) => {
      const key = forecastKey(stock.product.id, stock.warehouseId);
      const incomingQty = incomingByKey.get(key) ?? 0;
      const outgoingQty = outgoingByKey.get(key) ?? 0;
      const forecastQty = stock.quantity + incomingQty - outgoingQty;

      let alert: ForecastAlert = 'normal';
      if (forecastQty <= 0) {
        alert = 'shortageRisk';
      } else if (stock.quantity > 0 && forecastQty > stock.quantity * SURPLUS_MULTIPLIER) {
        alert = 'surplus';
      }

      // 規約 §1 DTO 境界: entity 直 spread を撤去し mapper 経由で DTO を組み立てる
      return toForecastStockResponse(stock, { incomingQty, outgoingQty, forecastQty, alert });
    });

    return okPaginated(data, buildPaginatedMeta(total, page, limit));
  }

  async getForecastForExport(query: FindForecastDto) {
    const result = await this.getForecast({ ...query, page: 1, limit: MAX_EXPORT_ROWS });
    return result.data;
  }
}
