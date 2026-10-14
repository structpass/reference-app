import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  RequireObjectTypePermission,
  RequirePermission,
} from '../../common/decorators';
import { UserRole } from '@prisma/client';
import { ObjectTypesService } from './object-types.service';
import { FindCustomRecordsDto } from './dto/find-custom-records.dto';
import { CreateObjectTypeDto } from './dto/create-object-type.dto';
import { UpdateObjectTypeDto } from './dto/update-object-type.dto';
import { CreateCustomRecordDto } from './dto/create-custom-record.dto';
import { UpdateCustomRecordDto } from './dto/update-custom-record.dto';

@ApiTags('object-types')
@Controller('object-types')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ObjectTypesController {
  constructor(private readonly objectTypesService: ObjectTypesService) {}

  @Post()
  @RequirePermission('object-types', 'create')
  @ApiOperation({ summary: 'ユーザー定義の台帳と項目定義を作成' })
  async create(@Body() dto: CreateObjectTypeDto) {
    return this.objectTypesService.create(dto);
  }

  @Put(':key')
  @RequirePermission('object-types', 'update')
  @ApiOperation({ summary: 'ユーザー定義の台帳と項目定義を更新' })
  @ApiParam({ name: 'key', description: '不変の台帳キー' })
  async update(@Param('key') key: string, @Body() dto: UpdateObjectTypeDto) {
    if (key.length > 100) {
      throw new BadRequestException('key must be 100 characters or fewer');
    }
    return this.objectTypesService.update(key, dto);
  }

  @Get()
  @ApiOperation({ summary: '種別定義一覧取得' })
  async findAll(@CurrentUser('role') role: UserRole | null = null) {
    return this.objectTypesService.findVisibleForUser(role);
  }

  @Get(':key')
  @RequireObjectTypePermission('view')
  @ApiOperation({ summary: '種別定義取得（キー指定）' })
  @ApiParam({ name: 'key', description: '種別キー（例: product, warehouse）' })
  async findByKey(@Param('key') key: string) {
    if (key.length > 100) {
      throw new BadRequestException('key must be 100 characters or fewer');
    }
    return this.objectTypesService.findByKey(key);
  }

  @Get(':key/records')
  @RequireObjectTypePermission('view')
  @ApiOperation({ summary: '自由定義データ一覧取得（ページング）' })
  @ApiParam({ name: 'key', description: '種別キー（例: product, warehouse）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  async findRecords(@Param('key') key: string, @Query() query: FindCustomRecordsDto) {
    if (key.length > 100) {
      throw new BadRequestException('key must be 100 characters or fewer');
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    return this.objectTypesService.findRecords(key, page, limit);
  }

  @Get(':key/records/:id')
  @RequireObjectTypePermission('view')
  @ApiOperation({ summary: '自由定義データを1件取得' })
  @ApiParam({ name: 'key', description: '非プリセットの種別キー（例: supplier-score）' })
  @ApiParam({ name: 'id', description: 'CustomRecord id' })
  async findRecord(@Param('key') key: string, @Param('id', ParseIntPipe) id: number) {
    if (key.length > 100) {
      throw new BadRequestException('key must be 100 characters or fewer');
    }
    return this.objectTypesService.findRecord(key, id);
  }

  @Post(':key/records')
  @RequireObjectTypePermission('create')
  @ApiOperation({ summary: '自由定義データを作成' })
  @ApiParam({ name: 'key', description: '非プリセットの種別キー（例: supplier-score）' })
  async createRecord(@Param('key') key: string, @Body() dto: CreateCustomRecordDto) {
    if (key.length > 100) {
      throw new BadRequestException('key must be 100 characters or fewer');
    }
    return this.objectTypesService.createRecord(key, dto);
  }

  @Put(':key/records/:id')
  @RequireObjectTypePermission('update')
  @ApiOperation({ summary: '自由定義データを更新（data 完全置換）' })
  @ApiParam({ name: 'key', description: '非プリセットの種別キー（例: supplier-score）' })
  @ApiParam({ name: 'id', description: 'CustomRecord id' })
  async updateRecord(
    @Param('key') key: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomRecordDto,
  ) {
    if (key.length > 100) {
      throw new BadRequestException('key must be 100 characters or fewer');
    }
    return this.objectTypesService.updateRecord(key, id, dto);
  }

  @Delete(':key/records/:id')
  @RequireObjectTypePermission('delete')
  @ApiOperation({ summary: '自由定義データを削除' })
  @ApiParam({ name: 'key', description: '非プリセットの種別キー（例: supplier-score）' })
  @ApiParam({ name: 'id', description: 'CustomRecord id' })
  async deleteRecord(@Param('key') key: string, @Param('id', ParseIntPipe) id: number) {
    if (key.length > 100) {
      throw new BadRequestException('key must be 100 characters or fewer');
    }
    return this.objectTypesService.deleteRecord(key, id);
  }
}
