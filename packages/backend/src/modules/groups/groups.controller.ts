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
  ParseUUIDPipe,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiProduces } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { ExcelService } from '../../common/services/excel.service';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, FindGroupsDto, AddMemberDto } from './dto';

@ApiTags('groups')
@Controller('groups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly excelService: ExcelService,
  ) {}

  @Get()
  @RequirePermission('groups', 'view')
  @ApiOperation({ summary: 'グループ一覧取得' })
  async findAll(@Query() query: FindGroupsDto) {
    return this.groupsService.findAll(query);
  }

  @Get('export')
  @RequirePermission('groups', 'view')
  @ApiOperation({ summary: 'グループExcelエクスポート' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // SEC-M6: ASCII 固定名でも RFC 5987 形式（filename* 併記）に統一。
  @Header('Content-Disposition', `attachment; filename="groups.xlsx"; filename*=UTF-8''groups.xlsx`)
  async exportExcel(@Query() query: FindGroupsDto): Promise<StreamableFile> {
    const statusMap: Record<string, string> = {
      ACTIVE: '有効',
      INACTIVE: '無効',
    };

    const roleMap: Record<string, string> = {
      WH_USER: '倉庫担当（一般）',
      WH_ADMIN: '倉庫担当（管理者）',
      OF_USER: '事務担当（一般）',
      OF_ADMIN: '事務担当（管理者）',
      SYS_ADMIN: 'システム管理者',
    };

    const groups = await this.groupsService.findAllForExport(query);
    const columns = [
      { header: 'グループコード', width: 18 },
      { header: 'グループ名', width: 25 },
      { header: '説明', width: 35 },
      { header: 'ロール', width: 20 },
      { header: 'ステータス', width: 12 },
      { header: '作成日', width: 20 },
    ];
    const rows = groups.map((g) => [
      g.code,
      g.name,
      g.description ?? '',
      g.role ? (roleMap[g.role] ?? g.role) : '',
      statusMap[g.status] ?? g.status,
      new Date(g.createdAt).toLocaleString('ja-JP'),
    ]);

    const buffer = await this.excelService.generate('グループ一覧', columns, rows);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission('groups', 'view')
  @ApiOperation({ summary: 'グループ詳細取得（メンバー含む）' })
  @ApiParam({ name: 'id', description: 'グループID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.findOne(id);
  }

  @Post()
  @RequirePermission('groups', 'create')
  @ApiOperation({ summary: 'グループ作成' })
  async create(@Body() dto: CreateGroupDto, @CurrentUser('role') callerRole: UserRole | null) {
    return this.groupsService.create(dto, callerRole);
  }

  @Put(':id')
  @RequirePermission('groups', 'update')
  @ApiOperation({ summary: 'グループ更新' })
  @ApiParam({ name: 'id', description: 'グループID' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupDto,
    @CurrentUser('role') callerRole: UserRole | null,
  ) {
    return this.groupsService.update(id, dto, callerRole);
  }

  @Delete(':id')
  @RequirePermission('groups', 'delete')
  @ApiOperation({ summary: 'グループ削除' })
  @ApiParam({ name: 'id', description: 'グループID' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('role') callerRole: UserRole | null,
  ) {
    return this.groupsService.remove(id, callerRole);
  }

  @Get(':id/members')
  @RequirePermission('groups', 'view')
  @ApiOperation({ summary: 'グループメンバー一覧取得' })
  @ApiParam({ name: 'id', description: 'グループID' })
  async findMembers(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.findMembers(id);
  }

  @Post(':id/members')
  @RequirePermission('groups', 'update')
  @ApiOperation({ summary: 'グループメンバー追加' })
  @ApiParam({ name: 'id', description: 'グループID' })
  async addMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMemberDto,
    @CurrentUser('id') callerId: string,
    @CurrentUser('role') callerRole: UserRole | null,
  ) {
    return this.groupsService.addMember(id, dto.userId, callerId, callerRole);
  }

  @Delete(':id/members/:userId')
  @RequirePermission('groups', 'update')
  @ApiOperation({ summary: 'グループメンバー削除' })
  @ApiParam({ name: 'id', description: 'グループID' })
  @ApiParam({ name: 'userId', description: 'ユーザーID (UUID)' })
  async removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('role') callerRole: UserRole | null,
  ) {
    return this.groupsService.removeMember(id, userId, callerRole);
  }
}
