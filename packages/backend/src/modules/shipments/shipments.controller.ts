import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiProduces } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExcelService } from '../../common/services/excel.service';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto, UpdateShipmentDto, FindShipmentsDto } from './dto';

@ApiTags('shipments')
@Controller('shipments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ShipmentsController {
  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('shipments', 'view')
  @ApiOperation({ summary: '出荷一覧取得' })
  async findAll(@Query() query: FindShipmentsDto) {
    return this.shipmentsService.findAll(query);
  }

  @Get('export')
  @RequirePermission('shipments', 'view')
  @ApiOperation({ summary: '出荷Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="shipments.xlsx"; filename*=UTF-8''shipments.xlsx`,
  )
  async exportExcel(@Query() query: FindShipmentsDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      DRAFT: '下書き',
      CONFIRMED: '確定',
      SHIPPED: '出荷完了',
    };

    const shipments = await this.shipmentsService.findAllForExport(query);
    const columns = [
      { header: '出荷番号', width: 22 },
      { header: '出荷日', width: 20 },
      { header: '倉庫', width: 12 },
      { header: '出荷先', width: 25 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = shipments.map((s) => [
      s.shipmentNo,
      new Date(s.shipmentDate).toLocaleString('ja-JP'),
      String(s.warehouseId),
      s.destination,
      statusMap[s.status] ?? s.status,
      new Date(s.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('出荷一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('shipments', 'view')
  @ApiOperation({ summary: '出荷詳細取得' })
  @ApiParam({ name: 'id', description: '出荷ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.shipmentsService.findOne(id);
  }

  @Post()
  @RequirePermission('shipments', 'create')
  @ApiOperation({ summary: '出荷作成' })
  async create(@Body() dto: CreateShipmentDto, @CurrentUser('id') userId: string) {
    return this.shipmentsService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermission('shipments', 'update')
  @ApiOperation({ summary: '出荷更新（DRAFT時のみ）' })
  @ApiParam({ name: 'id', description: '出荷ID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShipmentDto) {
    return this.shipmentsService.update(id, dto);
  }

  @Put(':id/confirm')
  @RequirePermission('shipments', 'update')
  @ApiOperation({ summary: '出荷確定（DRAFT→CONFIRMED、在庫減算）' })
  @ApiParam({ name: 'id', description: '出荷ID' })
  async confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.shipmentsService.confirm(id, userId);
  }

  @Put(':id/ship')
  @RequirePermission('shipments', 'update')
  @ApiOperation({ summary: '出荷完了（CONFIRMED→SHIPPED）' })
  @ApiParam({ name: 'id', description: '出荷ID' })
  async ship(@Param('id', ParseIntPipe) id: number) {
    return this.shipmentsService.ship(id);
  }

  @Delete(':id')
  @RequirePermission('shipments', 'delete')
  @ApiOperation({ summary: '出荷削除（ソフトデリート、CONFIRMED時は在庫加算）' })
  @ApiParam({ name: 'id', description: '出荷ID' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.shipmentsService.remove(id, userId);
  }
}
