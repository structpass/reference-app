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
import { ReceivingsService } from './receivings.service';
import { CreateReceivingDto, UpdateReceivingDto, FindReceivingsDto } from './dto';

@ApiTags('receivings')
@Controller('receivings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReceivingsController {
  constructor(
    private readonly receivingsService: ReceivingsService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('receivings', 'view')
  @ApiOperation({ summary: '入荷一覧取得' })
  async findAll(@Query() query: FindReceivingsDto) {
    return this.receivingsService.findAll(query);
  }

  @Get('export')
  @RequirePermission('receivings', 'view')
  @ApiOperation({ summary: '入荷Excelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="receivings.xlsx"; filename*=UTF-8''receivings.xlsx`,
  )
  async exportExcel(@Query() query: FindReceivingsDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      DRAFT: '下書き',
      CONFIRMED: '確定',
      COMPLETED: '完了',
    };

    const receivings = await this.receivingsService.findAllForExport(query);
    const columns = [
      { header: '入荷番号', width: 22 },
      { header: '入荷日', width: 20 },
      { header: '倉庫', width: 12 },
      { header: '仕入先', width: 25 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = receivings.map((r) => [
      r.receivingNo,
      new Date(r.receivingDate).toLocaleString('ja-JP'),
      String(r.warehouseId),
      r.supplier?.name ?? '',
      statusMap[r.status] ?? r.status,
      new Date(r.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('入荷一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('receivings', 'view')
  @ApiOperation({ summary: '入荷詳細取得' })
  @ApiParam({ name: 'id', description: '入荷ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.receivingsService.findOne(id);
  }

  @Post()
  @RequirePermission('receivings', 'create')
  @ApiOperation({ summary: '入荷作成' })
  async create(@Body() dto: CreateReceivingDto, @CurrentUser('id') userId: string) {
    return this.receivingsService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermission('receivings', 'update')
  @ApiOperation({ summary: '入荷更新（DRAFT時のみ）' })
  @ApiParam({ name: 'id', description: '入荷ID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReceivingDto) {
    return this.receivingsService.update(id, dto);
  }

  @Put(':id/confirm')
  @RequirePermission('receivings', 'update')
  @ApiOperation({ summary: '入荷確定（DRAFT→CONFIRMED、在庫加算）' })
  @ApiParam({ name: 'id', description: '入荷ID' })
  async confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.receivingsService.confirm(id, userId);
  }

  @Put(':id/complete')
  @RequirePermission('receivings', 'update')
  @ApiOperation({ summary: '入荷完了（CONFIRMED→COMPLETED）' })
  @ApiParam({ name: 'id', description: '入荷ID' })
  async complete(@Param('id', ParseIntPipe) id: number) {
    return this.receivingsService.complete(id);
  }

  @Delete(':id')
  @RequirePermission('receivings', 'delete')
  @ApiOperation({ summary: '入荷削除（ソフトデリート、CONFIRMED時は在庫減算）' })
  @ApiParam({ name: 'id', description: '入荷ID' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.receivingsService.remove(id, userId);
  }
}
