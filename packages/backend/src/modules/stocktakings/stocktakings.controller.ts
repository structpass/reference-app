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
import { StocktakingsService } from './stocktakings.service';
import { CreateStocktakingDto, UpdateStocktakingDto, FindStocktakingsDto } from './dto';

@ApiTags('stocktakings')
@Controller('stocktakings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StocktakingsController {
  constructor(
    private readonly stocktakingsService: StocktakingsService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('stocktakings', 'view')
  @ApiOperation({ summary: '棚卸一覧取得' })
  async findAll(@Query() query: FindStocktakingsDto) {
    return this.stocktakingsService.findAll(query);
  }

  @Get('export')
  @RequirePermission('stocktakings', 'view')
  @ApiOperation({ summary: '棚卸Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="stocktakings.xlsx"; filename*=UTF-8''stocktakings.xlsx`,
  )
  async exportExcel(@Query() query: FindStocktakingsDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      DRAFT: '下書き',
      CONFIRMED: '確定',
    };

    const stocktakings = await this.stocktakingsService.findAllForExport(query);
    const columns = [
      { header: '棚卸ID', width: 12 },
      { header: '棚卸日', width: 20 },
      { header: '倉庫', width: 12 },
      { header: '担当者', width: 20 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = stocktakings.map((st) => [
      String(st.id),
      new Date(st.stocktakingDate).toLocaleString('ja-JP'),
      String(st.warehouseId),
      st.stocktaker ?? '',
      statusMap[st.status] ?? st.status,
      new Date(st.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('棚卸一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('stocktakings', 'view')
  @ApiOperation({ summary: '棚卸詳細取得' })
  @ApiParam({ name: 'id', description: '棚卸ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.stocktakingsService.findOne(id);
  }

  @Post()
  @RequirePermission('stocktakings', 'create')
  @ApiOperation({ summary: '棚卸作成' })
  async create(@Body() dto: CreateStocktakingDto, @CurrentUser('id') userId: string) {
    return this.stocktakingsService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermission('stocktakings', 'update')
  @ApiOperation({ summary: '棚卸更新（DRAFT時のみ）' })
  @ApiParam({ name: 'id', description: '棚卸ID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStocktakingDto) {
    return this.stocktakingsService.update(id, dto);
  }

  @Put(':id/confirm')
  @RequirePermission('stocktakings', 'update')
  @ApiOperation({ summary: '棚卸確定（ADMIN系のみ、在庫上書き）' })
  @ApiParam({ name: 'id', description: '棚卸ID' })
  async confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.stocktakingsService.confirm(id, userId);
  }

  @Delete(':id')
  @RequirePermission('stocktakings', 'delete')
  @ApiOperation({ summary: '棚卸削除（DRAFT時のみ）' })
  @ApiParam({ name: 'id', description: '棚卸ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.stocktakingsService.remove(id);
  }
}
