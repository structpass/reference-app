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
import { CarriersService } from './carriers.service';
import { CreateCarrierDto, UpdateCarrierDto, FindCarriersDto } from './dto';

@ApiTags('carriers')
@Controller('carriers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CarriersController {
  constructor(
    private readonly carriersService: CarriersService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('carriers', 'view')
  @ApiOperation({ summary: '運送会社一覧取得' })
  async findAll(@Query() query: FindCarriersDto) {
    return this.carriersService.findAll(query);
  }

  @Get('export')
  @RequirePermission('carriers', 'view')
  @ApiOperation({ summary: '運送会社Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="carriers.xlsx"; filename*=UTF-8''carriers.xlsx`,
  )
  async exportExcel(@Query() query: FindCarriersDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      ACTIVE: '有効',
      INACTIVE: '無効',
    };

    const carriers = await this.carriersService.findAllForExport(query);
    const columns = [
      { header: '運送会社コード', width: 18 },
      { header: '運送会社名', width: 25 },
      { header: '電話番号', width: 15 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = carriers.map((c) => [
      c.code,
      c.name,
      c.phone ?? '',
      statusMap[c.status] ?? c.status,
      new Date(c.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('運送会社一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('carriers', 'view')
  @ApiOperation({ summary: '運送会社詳細取得' })
  @ApiParam({ name: 'id', description: '運送会社ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.carriersService.findOne(id);
  }

  @Post()
  @RequirePermission('carriers', 'create')
  @ApiOperation({ summary: '運送会社作成' })
  async create(@Body() dto: CreateCarrierDto) {
    return this.carriersService.create(dto);
  }

  @Put(':id')
  @RequirePermission('carriers', 'update')
  @ApiOperation({ summary: '運送会社更新' })
  @ApiParam({ name: 'id', description: '運送会社ID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCarrierDto) {
    return this.carriersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('carriers', 'delete')
  @ApiOperation({ summary: '運送会社削除' })
  @ApiParam({ name: 'id', description: '運送会社ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.carriersService.remove(id);
  }
}
