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
import { ExcelService } from '../../common/services/excel.service';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto, FindWarehousesDto } from './dto';

@ApiTags('warehouses')
@Controller('warehouses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WarehousesController {
  constructor(
    private readonly warehousesService: WarehousesService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('warehouses', 'view')
  @ApiOperation({ summary: '倉庫一覧取得' })
  async findAll(@Query() query: FindWarehousesDto) {
    return this.warehousesService.findAll(query);
  }

  @Get('export')
  @RequirePermission('warehouses', 'view')
  @ApiOperation({ summary: '倉庫Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="warehouses.xlsx"; filename*=UTF-8''warehouses.xlsx`,
  )
  async exportExcel(@Query() query: FindWarehousesDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      ACTIVE: '有効',
      INACTIVE: '無効',
    };

    const warehouses = await this.warehousesService.findAllForExport(query);
    const columns = [
      { header: '倉庫コード', width: 15 },
      { header: '倉庫名', width: 25 },
      { header: '住所', width: 35 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = warehouses.map((w) => [
      w.code,
      w.name,
      w.address ?? '',
      statusMap[w.status] ?? w.status,
      new Date(w.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('倉庫一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('warehouses', 'view')
  @ApiOperation({ summary: '倉庫詳細取得' })
  @ApiParam({ name: 'id', description: '倉庫ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.warehousesService.findOne(id);
  }

  @Post()
  @RequirePermission('warehouses', 'create')
  @ApiOperation({ summary: '倉庫作成' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Put(':id')
  @RequirePermission('warehouses', 'update')
  @ApiOperation({ summary: '倉庫更新' })
  @ApiParam({ name: 'id', description: '倉庫ID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('warehouses', 'delete')
  @ApiOperation({ summary: '倉庫削除' })
  @ApiParam({ name: 'id', description: '倉庫ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.warehousesService.remove(id);
  }
}
