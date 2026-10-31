import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

const mockPermissionsService = {
  getAllRolePermissions: jest.fn(),
  bulkSetRolePermissions: jest.fn(),
  getMyPermissions: jest.fn(),
};

describe('PermissionsController', () => {
  let controller: PermissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [{ provide: PermissionsService, useValue: mockPermissionsService }],
    }).compile();

    controller = module.get<PermissionsController>(PermissionsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllRolePermissions', () => {
    it('ロール別権限マトリクスを返すこと', async () => {
      const expected = { success: true, data: [{ role: 'WH_USER', featureId: 'products' }] };
      mockPermissionsService.getAllRolePermissions.mockResolvedValue(expected);

      const result = await controller.getAllRolePermissions();

      expect(result).toEqual(expected);
      expect(mockPermissionsService.getAllRolePermissions).toHaveBeenCalled();
    });
  });

  describe('bulkSetRolePermissions', () => {
    it('ロール別権限を一括保存して返すこと', async () => {
      const dto = {
        permissions: [
          {
            role: 'WH_USER',
            featureId: 'products',
            canView: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
          },
        ],
      };
      const expected = { success: true, data: dto.permissions };
      mockPermissionsService.bulkSetRolePermissions.mockResolvedValue(expected);

      const result = await controller.bulkSetRolePermissions(dto as any);

      expect(result).toEqual(expected);
      expect(mockPermissionsService.bulkSetRolePermissions).toHaveBeenCalledWith(dto);
    });
  });

  describe('getMyPermissions', () => {
    it('自分の有効権限を返すこと', async () => {
      const expected = { success: true, data: { permissions: [] } };
      mockPermissionsService.getMyPermissions.mockResolvedValue(expected);

      const result = await controller.getMyPermissions('user-uuid');

      expect(result).toEqual(expected);
      expect(mockPermissionsService.getMyPermissions).toHaveBeenCalledWith('user-uuid');
    });
  });
});
