import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // @RequirePermission を意図的に付けない: 単一 feature に閉じず、DashboardService 側で
  // featureId ごとに canView を判定して結果配列から除外する（見えない機能は count 自体を返さない）。
  @Get('counts')
  @ApiOperation({ summary: '各マスタ/トランザクションの登録件数を権限フィルタ付きで集計取得' })
  async getCounts(@CurrentUser('role') role: UserRole | null) {
    return this.dashboardService.getCounts(role);
  }
}
