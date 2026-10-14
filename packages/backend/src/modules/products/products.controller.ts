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
  ParseUUIDPipe,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiProduces } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FindProductsDto } from './dto/find-products.dto';
import { ExcelService } from './excel.service';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: '商品一覧取得' })
  async findAll(@Query() query: FindProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('export/excel')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: '商品データExcelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header(
    'Content-Disposition',
    `attachment; filename="products.xlsx"; filename*=UTF-8''products.xlsx`,
  )
  async exportExcel(@Query() query: FindProductsDto): Promise<StreamableFile> {
    const products = await this.productsService.findAllForExport(query);
    const buffer = await this.excelService.generateProductExcel(products);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: '商品詳細取得' })
  @ApiParam({ name: 'id', description: '商品ID (UUID)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @RequirePermission('products', 'create')
  @ApiOperation({ summary: '商品作成' })
  async create(@Body() createProductDto: CreateProductDto, @CurrentUser('id') userId: string) {
    return this.productsService.create(createProductDto, userId);
  }

  @Put(':id')
  @RequirePermission('products', 'update')
  @ApiOperation({ summary: '商品更新' })
  @ApiParam({ name: 'id', description: '商品ID (UUID)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productsService.update(id, updateProductDto, userId);
  }

  @Delete(':id')
  @RequirePermission('products', 'delete')
  @ApiOperation({ summary: '商品削除' })
  @ApiParam({ name: 'id', description: '商品ID (UUID)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }
}
