import { Controller, Get, Query, UseGuards, StreamableFile, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../common/decorators';
import { ExcelService } from '../../common/services/excel.service';
import { ShippingService } from './shipping.service';
import { FindShippingDto } from './dto';

@ApiTags('shipping')
@Controller('shipping')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ShippingController {
  constructor(
    private readonly shippingService: ShippingService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('shipping', 'view')
  @ApiOperation({ summary: '入出荷統合一覧取得' })
  async findAll(@Query() query: FindShippingDto) {
    return this.shippingService.findAll(query);
  }

  @Get('export')
  @RequirePermission('shipping', 'view')
  @ApiOperation({ summary: '入出荷データExcelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="shipping.xlsx"; filename*=UTF-8''shipping.xlsx`,
  )
  async exportExcel(@Query() query: FindShippingDto): Promise<StreamableFile> {
    const records = await this.shippingService.findAllForExport(query);

    const columns = [
      { header: '種別', width: 10 },
      { header: '伝票番号', width: 22 },
      { header: '日付', width: 15 },
      { header: '倉庫', width: 20 },
      { header: '取引先', width: 25 },
      { header: 'ステータス', width: 12 },
    ];
    const rows = records.map((r) => [
      r.type === 'RECEIVING' ? '入荷' : '出荷',
      r.documentNo,
      new Date(r.date).toISOString().split('T')[0],
      r.warehouseName,
      r.counterparty,
      r.status,
    ]);

    const buffer = await this.excelService.generate('入出荷一覧', columns, rows);
    return new StreamableFile(buffer);
  }
}
