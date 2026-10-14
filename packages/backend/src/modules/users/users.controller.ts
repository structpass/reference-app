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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { ExcelService } from '../../common/services/excel.service';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, FindUsersDto } from './dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'ユーザー一覧取得（グループ統合検索）' })
  async findAll(@Query() query: FindUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('export')
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'ユーザーExcelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header('Content-Disposition', `attachment; filename="users.xlsx"; filename*=UTF-8''users.xlsx`)
  async exportExcel(@Query() query: FindUsersDto): Promise<StreamableFile> {
    const roleMap: Record<string, string> = {
      WH_USER: '倉庫担当（一般）',
      WH_ADMIN: '倉庫担当（管理者）',
      OF_USER: '事務担当（一般）',
      OF_ADMIN: '事務担当（管理者）',
      SYS_ADMIN: 'システム管理者',
    };

    const users = await this.usersService.findAllForExport(query);
    const columns = [
      { header: '名前', width: 20 },
      { header: 'メール', width: 30 },
      { header: 'ロール', width: 20 },
      { header: '状態', width: 10 },
      { header: '最終ログイン', width: 20 },
      { header: '作成日', width: 20 },
    ];
    const rows = users.map((u) => [
      u.name,
      u.email,
      u.role ? (roleMap[u.role] ?? u.role) : '権限待ち',
      u.isActive ? '有効' : '無効',
      u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ja-JP') : '-',
      new Date(u.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('ユーザー一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'ユーザー詳細取得' })
  @ApiParam({ name: 'id', description: 'ユーザーID (UUID)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermission('users', 'create')
  @ApiOperation({ summary: 'ユーザー作成' })
  async create(@Body() dto: CreateUserDto, @CurrentUser('role') callerRole: UserRole | null) {
    return this.usersService.create(dto, callerRole);
  }

  @Put(':id')
  @RequirePermission('users', 'update')
  @ApiOperation({ summary: 'ユーザー更新' })
  @ApiParam({ name: 'id', description: 'ユーザーID (UUID)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('role') callerRole: UserRole | null,
  ) {
    return this.usersService.update(id, dto, callerRole);
  }

  @Delete(':id')
  @RequirePermission('users', 'delete')
  @ApiOperation({ summary: 'ユーザー削除' })
  @ApiParam({ name: 'id', description: 'ユーザーID (UUID)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') callerRole: UserRole | null,
  ) {
    return this.usersService.remove(id, callerRole);
  }
}
