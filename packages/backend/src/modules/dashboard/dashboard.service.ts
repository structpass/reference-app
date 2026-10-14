import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ok } from '../../common/dto';
import { PermissionsService } from '../permissions/permissions.service';
import {
  DashboardRepository,
  DASHBOARD_COUNT_FEATURE_IDS,
} from './repositories/dashboard.repository';
import type { DashboardCountsResponseDto } from './dto/dashboard-counts-response.dto';

@Injectable()
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly permissions: PermissionsService,
  ) {}

  async getCounts(role: UserRole | null) {
    const permissionMap = await this.permissions.getEffectivePermissionMap(role);
    const viewableFeatureIds = DASHBOARD_COUNT_FEATURE_IDS.filter(
      (featureId) => permissionMap.get(featureId)?.canView === true,
    );

    const counts = await this.repo.countByFeatureIds(viewableFeatureIds);
    return ok<DashboardCountsResponseDto>({ counts });
  }
}
