import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { DashboardService } from '../dashboard.service';
import { DashboardRepository } from '../repositories/dashboard.repository';
import { PermissionsService } from '../../permissions/permissions.service';

const mockRepo = {
  countByFeatureIds: jest.fn(),
};

const mockPermissions = {
  getEffectivePermissionMap: jest.fn(),
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardRepository, useValue: mockRepo },
        { provide: PermissionsService, useValue: mockPermissions },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  it('canView=true の featureId のみ repository へ渡す（権限フィルタが効く）', async () => {
    const map = new Map<
      string,
      { canView: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }
    >([
      ['products', { canView: true, canCreate: false, canUpdate: false, canDelete: false }],
      ['permissions', { canView: false, canCreate: false, canUpdate: false, canDelete: false }],
    ]);
    mockPermissions.getEffectivePermissionMap.mockResolvedValue(map);
    mockRepo.countByFeatureIds.mockResolvedValue([{ featureId: 'products', count: 3 }]);

    await service.getCounts(UserRole.WH_USER);

    expect(mockRepo.countByFeatureIds).toHaveBeenCalledWith(['products']);
  });

  it('権限のない role（map が空）では repository へ空配列を渡す', async () => {
    mockPermissions.getEffectivePermissionMap.mockResolvedValue(new Map());
    mockRepo.countByFeatureIds.mockResolvedValue([]);

    await service.getCounts(null);

    expect(mockRepo.countByFeatureIds).toHaveBeenCalledWith([]);
  });

  it('{ success: true, data: { counts } } の shape で返すこと', async () => {
    const map = new Map([
      ['products', { canView: true, canCreate: false, canUpdate: false, canDelete: false }],
    ]);
    mockPermissions.getEffectivePermissionMap.mockResolvedValue(map);
    mockRepo.countByFeatureIds.mockResolvedValue([{ featureId: 'products', count: 7 }]);

    const result = await service.getCounts(UserRole.SYS_ADMIN);

    expect(result).toEqual({
      success: true,
      data: { counts: [{ featureId: 'products', count: 7 }] },
    });
  });
});
