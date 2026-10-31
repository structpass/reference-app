import { Controller, Get, Query, UseGuards, StreamableFile, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../common/decorators';
import { ExcelService } from '../../common/services/excel.service';
import { StocksService } from './stocks.service';
import { FindStocksDto, FindForecastDto } from './dto';

@ApiTags('stocks')
@Controller('stocks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('stocks', 'view')
  @ApiOperation({ summary: '倉庫別在庫一覧取得' })
  async findAll(@Query() query: FindStocksDto) {
    return this.stocksService.findAll(query);
  }

  @Get('export')
  @RequirePermission('stocks', 'view')
  @ApiOperation({ summary: '在庫データExcelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header('Content-Disposition', `attachment; filename="stocks.xlsx"; filename*=UTF-8''stocks.xlsx`)
  async exportExcel(@Query() query: FindStocksDto): Promise<StreamableFile> {
    const stocks = await this.stocksService.findAllForExport(query);

    const columns = [
      { header: '倉庫コード', width: 15 },
      { header: '倉庫名', width: 25 },
      { header: '商品コード', width: 15 },
      { header: '商品名', width: 30 },
      { header: 'カテゴリー', width: 15 },
      { header: '単位', width: 10 },
      { header: '在庫数', width: 12 },
    ];
    const rows = stocks.map((s) => [
      s.warehouse.code,
      s.warehouse.name,
      s.product.code,
      s.product.name,
      (s.product as { category?: { name?: string } }).category?.name ?? '',
      s.product.unit ?? '',
      String(s.quantity),
    ]);

    const buffer = await this.excelService.generate('倉庫別在庫一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get('forecast')
  @RequirePermission('forecast', 'view')
  @ApiOperation({ summary: '予測在庫一覧取得' })
  async getForecast(@Query() query: FindForecastDto) {
    return this.stocksService.getForecast(query);
  }

  @Get('forecast/export')
  @RequirePermission('forecast', 'view')
  @ApiOperation({ summary: '予測在庫Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="forecast.xlsx"; filename*=UTF-8''forecast.xlsx`,
  )
  async exportForecastExcel(@Query() query: FindForecastDto): Promise<StreamableFile> {
    const forecasts = await this.stocksService.getForecastForExport(query);

    const columns = [
      { header: '倉庫コード', width: 15 },
      { header: '倉庫名', width: 25 },
      { header: '商品コード', width: 15 },
      { header: '商品名', width: 30 },
      { header: '現在庫', width: 12 },
      { header: '入荷予定', width: 12 },
      { header: '出荷予定', width: 12 },
      { header: '予測在庫', width: 12 },
      { header: 'アラート', width: 15 },
    ];
    const rows = forecasts.map((f) => [
      f.warehouse.code,
      f.warehouse.name,
      f.product.code,
      f.product.name,
      String(f.quantity),
      String(f.incomingQty),
      String(f.outgoingQty),
      String(f.forecastQty),
      f.alert,
    ]);

    const buffer = await this.excelService.generate('予測在庫一覧', columns, rows);
    return new StreamableFile(buffer);
  }
}
