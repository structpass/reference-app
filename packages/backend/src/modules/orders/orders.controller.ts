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
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto, FindOrdersDto } from './dto';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('orders', 'view')
  @ApiOperation({ summary: '発注一覧取得' })
  async findAll(@Query() query: FindOrdersDto) {
    return this.ordersService.findAll(query);
  }

  @Get('export')
  @RequirePermission('orders', 'view')
  @ApiOperation({ summary: '発注Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header('Content-Disposition', `attachment; filename="orders.xlsx"; filename*=UTF-8''orders.xlsx`)
  async exportExcel(@Query() query: FindOrdersDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      DRAFT: '下書き',
      ORDERED: '発注確定',
    };

    const orders = await this.ordersService.findAllForExport(query);
    const columns = [
      { header: '発注番号', width: 22 },
      { header: '発注日', width: 20 },
      { header: '仕入先', width: 25 },
      { header: '合計金額', width: 15 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = orders.map((o) => [
      o.orderNo,
      new Date(o.orderDate).toLocaleString('ja-JP'),
      o.supplier?.name ?? '',
      o.totalAmount != null ? String(o.totalAmount) : '',
      statusMap[o.status] ?? o.status,
      new Date(o.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('発注一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('orders', 'view')
  @ApiOperation({ summary: '発注詳細取得' })
  @ApiParam({ name: 'id', description: '発注ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @RequirePermission('orders', 'create')
  @ApiOperation({ summary: '発注作成' })
  async create(@Body() dto: CreateOrderDto, @CurrentUser('id') userId: string) {
    return this.ordersService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermission('orders', 'update')
  @ApiOperation({ summary: '発注更新（DRAFT時のみ）' })
  @ApiParam({ name: 'id', description: '発注ID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @Put(':id/confirm')
  @RequirePermission('orders', 'update')
  @ApiOperation({ summary: '発注確定（DRAFT→ORDERED）' })
  @ApiParam({ name: 'id', description: '発注ID' })
  async confirm(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.confirm(id);
  }

  @Delete(':id')
  @RequirePermission('orders', 'delete')
  @ApiOperation({ summary: '発注削除（ソフトデリート）' })
  @ApiParam({ name: 'id', description: '発注ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.remove(id);
  }
}
