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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto, FindSuppliersDto } from './dto';

@ApiTags('suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: '仕入先一覧取得' })
  async findAll(@Query() query: FindSuppliersDto) {
    return this.suppliersService.findAll(query);
  }

  @Get('export')
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: '仕入先Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="suppliers.xlsx"; filename*=UTF-8''suppliers.xlsx`,
  )
  async exportExcel(@Query() query: FindSuppliersDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      ACTIVE: '有効',
      INACTIVE: '無効',
    };

    const suppliers = await this.suppliersService.findAllForExport(query);
    const columns = [
      { header: '仕入先コード', width: 18 },
      { header: '仕入先名', width: 25 },
      { header: '電話番号', width: 15 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = suppliers.map((s) => [
      s.code,
      s.name,
      s.phone ?? '',
      statusMap[s.status] ?? s.status,
      new Date(s.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('仕入先一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: '仕入先詳細取得' })
  @ApiParam({ name: 'id', description: '仕入先ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @RequirePermission('suppliers', 'create')
  @ApiOperation({ summary: '仕入先作成' })
  async create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Put(':id')
  @RequirePermission('suppliers', 'update')
  @ApiOperation({ summary: '仕入先更新' })
  @ApiParam({ name: 'id', description: '仕入先ID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('suppliers', 'delete')
  @ApiOperation({ summary: '仕入先削除' })
  @ApiParam({ name: 'id', description: '仕入先ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.remove(id);
  }
}
