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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, FindCategoriesDto } from './dto';

@ApiTags('categories')
@Controller('categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('categories', 'view')
  @ApiOperation({ summary: 'カテゴリー一覧取得' })
  async findAll(@Query() query: FindCategoriesDto) {
    return this.categoriesService.findAll(query);
  }

  @Get('export')
  @RequirePermission('categories', 'view')
  @ApiOperation({ summary: 'カテゴリーExcelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="categories.xlsx"; filename*=UTF-8''categories.xlsx`,
  )
  async exportExcel(@Query() query: FindCategoriesDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      ACTIVE: '有効',
      INACTIVE: '無効',
    };

    const categories = await this.categoriesService.findAllForExport(query);
    const columns = [
      { header: 'カテゴリーコード', width: 18 },
      { header: 'カテゴリー名', width: 25 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = categories.map((c) => [
      c.code,
      c.name,
      statusMap[c.status] ?? c.status,
      new Date(c.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('カテゴリー一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('categories', 'view')
  @ApiOperation({ summary: 'カテゴリー詳細取得' })
  @ApiParam({ name: 'id', description: 'カテゴリーID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @RequirePermission('categories', 'create')
  @ApiOperation({ summary: 'カテゴリー作成' })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Put(':id')
  @RequirePermission('categories', 'update')
  @ApiOperation({ summary: 'カテゴリー更新' })
  @ApiParam({ name: 'id', description: 'カテゴリーID' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('categories', 'delete')
  @ApiOperation({ summary: 'カテゴリー削除' })
  @ApiParam({ name: 'id', description: 'カテゴリーID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
