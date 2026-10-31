import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { objectTypePermissionId } from '@struct-pass/shared';
import { PermissionsService } from './permissions.service';
import { PermissionsRepository } from './repositories/permissions.repository';

/** RolePermissionResponseDto shape */
const mockRolePermission = {
  id: 1,
  role: UserRole.WH_USER,
  featureId: 'products',
  canView: true,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
};

const mockRepo = {
  findAllRolePermissions: jest.fn(),
  findRolePermissionsByRole: jest.fn(),
  findObjectTypesForPermissions: jest.fn(),
  findObjectTypeForPermission: jest.fn(),
  bulkUpsertRolePermissions: jest.fn(),
  findUserById: jest.fn(),
};

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionsService, { provide: PermissionsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    jest.clearAllMocks();
    mockRepo.findObjectTypesForPermissions.mockResolvedValue([]);
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('getAllRolePermissions', () => {
    it('全ロール権限一覧を返すこと', async () => {
      mockRepo.findAllRolePermissions.mockResolvedValue([mockRolePermission]);

      const result = await service.getAllRolePermissions();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('RolePermissionResponseDto の shape を持つこと', async () => {
      mockRepo.findAllRolePermissions.mockResolvedValue([mockRolePermission]);

      const result = await service.getAllRolePermissions();

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: mockRolePermission.id,
          role: UserRole.WH_USER,
          featureId: mockRolePermission.featureId,
          canView: mockRolePermission.canView,
          canCreate: mockRolePermission.canCreate,
          canUpdate: mockRolePermission.canUpdate,
          canDelete: mockRolePermission.canDelete,
        }),
      );
    });
  });

  describe('bulkSetRolePermissions', () => {
    it('ロール権限を一括更新すること', async () => {
      const dto = {
        permissions: [
          {
            role: UserRole.WH_USER,
            featureId: 'products',
            canView: true,
            canCreate: true,
            canUpdate: false,
            canDelete: false,
          },
        ],
      };
      const updated = { ...mockRolePermission, canCreate: true };
      mockRepo.bulkUpsertRolePermissions.mockResolvedValue([updated]);

      const result = await service.bulkSetRolePermissions(dto as never);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockRepo.bulkUpsertRolePermissions).toHaveBeenCalledWith(dto.permissions);
    });

    it('RolePermissionResponseDto の shape を持つこと', async () => {
      const updated = { ...mockRolePermission, canCreate: true };
      mockRepo.bulkUpsertRolePermissions.mockResolvedValue([updated]);

      const result = await service.bulkSetRolePermissions({ permissions: [] } as never);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: updated.id,
          role: UserRole.WH_USER,
          featureId: updated.featureId,
          canView: updated.canView,
          canCreate: true,
        }),
      );
    });
  });

  describe('getMyPermissions', () => {
    it('SYS_ADMINユーザーは全機能の全権限を返すこと', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-1', role: 'SYS_ADMIN' });

      const result = await service.getMyPermissions('user-1');

      expect(result.success).toBe(true);
      expect(result.data.permissions.length).toBeGreaterThan(0);
      for (const perm of result.data.permissions) {
        expect(perm.canView).toBe(true);
        expect(perm.canCreate).toBe(true);
        expect(perm.canUpdate).toBe(true);
        expect(perm.canDelete).toBe(true);
      }
    });

    // ref-0069: SYS_ADMIN が object-types を含む全 DEFAULT_ROLE_PERMISSIONS キーへ
    // 全 action 許可されることを固定。修正前は object-types が DEFAULT_ROLE_PERMISSIONS に
    // 存在しなかったため、SYS_ADMIN の effective permission map から漏れ、恒久 403 になっていた。
    it('SYS_ADMIN は object-types も RW で取得できること（ref-0069・恒久 403 修正）', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-1', role: 'SYS_ADMIN' });

      const result = await service.getMyPermissions('user-1');

      expect(result.success).toBe(true);
      const objectTypesPerm = result.data.permissions.find((p) => p.featureId === 'object-types');
      expect(objectTypesPerm).toBeDefined();
      expect(objectTypesPerm).toMatchObject({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    });

    it('response shape に role field を含まないこと（情報過多開示の防止）', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-1', role: 'SYS_ADMIN' });

      const result = await service.getMyPermissions('user-1');

      expect(result.data).not.toHaveProperty('role');
    });

    it('非SYS_ADMINユーザーはデフォルト権限とDB権限のマージを返すこと', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-2', role: 'WH_USER' });
      mockRepo.findRolePermissionsByRole.mockResolvedValue([]);

      const result = await service.getMyPermissions('user-2');

      expect(result.success).toBe(true);
      const productsPerm = result.data.permissions.find((p) => p.featureId === 'products');
      expect(productsPerm).toBeDefined();
      expect(productsPerm!.canView).toBe(true);
      expect(productsPerm!.canCreate).toBe(false);
    });

    it('全 action が false の feature は response から除外されること（feature 列挙の防止）', async () => {
      // WH_USER は permissions / system-parameters が NONE（全 false）
      mockRepo.findUserById.mockResolvedValue({ id: 'user-2', role: 'WH_USER' });
      mockRepo.findRolePermissionsByRole.mockResolvedValue([]);

      const result = await service.getMyPermissions('user-2');

      const featureIds = result.data.permissions.map((p) => p.featureId);
      expect(featureIds).not.toContain('permissions');
      expect(featureIds).not.toContain('system-parameters');
    });

    it('DB の overlay で全 action が false にされた feature も response から除外されること', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-3', role: 'WH_USER' });
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        // default では canView=true (RO_USER) の products を DB overlay で全 false に
        {
          featureId: 'products',
          canView: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        },
      ]);

      const result = await service.getMyPermissions('user-3');

      const featureIds = result.data.permissions.map((p) => p.featureId);
      expect(featureIds).not.toContain('products');
    });

    it('DBのロール権限がデフォルトを上書きすること', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-3', role: 'WH_USER' });
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        { featureId: 'products', canView: true, canCreate: true, canUpdate: true, canDelete: true },
      ]);

      const result = await service.getMyPermissions('user-3');

      const productsPerm = result.data.permissions.find((p) => p.featureId === 'products');
      expect(productsPerm!.canCreate).toBe(true);
      expect(productsPerm!.canDelete).toBe(true);
    });

    it('動的台帳はviewなしのwrite権限をmy-permissionsへ列挙しないこと', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-4', role: UserRole.WH_USER });
      mockRepo.findObjectTypesForPermissions.mockResolvedValue([
        { key: 'secret-ledger', isPreset: false },
      ]);
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        {
          featureId: objectTypePermissionId('secret-ledger'),
          canView: false,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      ]);

      const result = await service.getMyPermissions('user-4');

      expect(result.data.permissions.map((permission) => permission.featureId)).not.toContain(
        objectTypePermissionId('secret-ledger'),
      );
    });

    it('ユーザーが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findUserById.mockResolvedValue(null);

      await expect(service.getMyPermissions('xxx')).rejects.toThrow(NotFoundException);
    });

    it('現存する非プリセット台帳を動的権限IDとして解決すること', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-2', role: UserRole.WH_USER });
      mockRepo.findObjectTypesForPermissions.mockResolvedValue([
        { key: 'project', isPreset: false },
        { key: 'product', isPreset: true },
      ]);
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        {
          featureId: objectTypePermissionId('project'),
          canView: true,
          canCreate: true,
          canUpdate: false,
          canDelete: false,
        },
        {
          featureId: 'object-type:unknown',
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      ]);

      const result = await service.getMyPermissions('user-2');
      const project = result.data.permissions.find(
        (permission) => permission.featureId === objectTypePermissionId('project'),
      );

      expect(project).toMatchObject({ canView: true, canCreate: true });
      expect(result.data.permissions.map((permission) => permission.featureId)).not.toContain(
        'object-type:unknown',
      );
    });

    it('SYS_ADMINは現存する非プリセット台帳も全action許可で解決すること', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'admin', role: UserRole.SYS_ADMIN });
      mockRepo.findObjectTypesForPermissions.mockResolvedValue([
        { key: 'project', isPreset: false },
      ]);

      const result = await service.getMyPermissions('admin');
      expect(result.data.permissions).toContainEqual({
        featureId: objectTypePermissionId('project'),
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    });
  });

  describe('bulkSetRolePermissions', () => {
    it('現存する非プリセット台帳の動的権限IDを受け付けること', async () => {
      const dto = {
        permissions: [
          {
            role: UserRole.WH_USER,
            featureId: objectTypePermissionId('project'),
            canView: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
          },
        ],
      };
      mockRepo.findObjectTypesForPermissions.mockResolvedValue([
        { key: 'project', isPreset: false },
      ]);
      mockRepo.bulkUpsertRolePermissions.mockResolvedValue([{ id: 2, ...dto.permissions[0] }]);

      await expect(service.bulkSetRolePermissions(dto)).resolves.toMatchObject({ success: true });
      expect(mockRepo.bulkUpsertRolePermissions).toHaveBeenCalledWith(dto.permissions);
    });

    it.each(['object-type:missing', 'object-type:product', 'object-type:Bad_Key', 'not-a-feature'])(
      '未知・preset・不正なfeatureIdを拒否すること: %s',
      async (featureId) => {
        mockRepo.findObjectTypesForPermissions.mockResolvedValue([
          { key: 'product', isPreset: true },
        ]);

        await expect(
          service.bulkSetRolePermissions({
            permissions: [
              {
                role: UserRole.WH_USER,
                featureId,
                canView: true,
                canCreate: false,
                canUpdate: false,
                canDelete: false,
              },
            ],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockRepo.bulkUpsertRolePermissions).not.toHaveBeenCalled();
      },
    );

    it('同一roleとfeatureIdの重複入力を拒否すること', async () => {
      const permission = {
        role: UserRole.WH_USER,
        featureId: 'products',
        canView: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      };
      await expect(
        service.bulkSetRolePermissions({ permissions: [permission, permission] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.bulkUpsertRolePermissions).not.toHaveBeenCalled();
    });
  });

  // v2-274: SYS_ADMIN 専用 feature は保存入力でも実効権限でも非 SYS_ADMIN へ立てさせない。
  describe('SYS_ADMIN専用featureの固定（v2-274）', () => {
    const denyRow = (featureId: string) => ({
      role: UserRole.WH_USER,
      featureId,
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    });

    it.each(['object-types', 'permissions', 'system-parameters'])(
      '非SYS_ADMINロールへ %s の権限を立てる保存入力を400で拒否すること',
      async (featureId) => {
        await expect(
          service.bulkSetRolePermissions({ permissions: [denyRow(featureId)] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockRepo.bulkUpsertRolePermissions).not.toHaveBeenCalled();
      },
    );

    it('全action falseの行は受理すること（権限マトリクス画面は固定OFFの行も送る）', async () => {
      const dto = {
        permissions: [
          {
            role: UserRole.WH_USER,
            featureId: 'object-types',
            canView: false,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
          },
        ],
      };
      mockRepo.bulkUpsertRolePermissions.mockResolvedValue([{ id: 9, ...dto.permissions[0] }]);

      await expect(service.bulkSetRolePermissions(dto)).resolves.toMatchObject({ success: true });
      expect(mockRepo.bulkUpsertRolePermissions).toHaveBeenCalledWith(dto.permissions);
    });

    it('SYS_ADMIN自身の行は拒否しないこと（復旧経路を止めない）', async () => {
      const dto = {
        permissions: [
          {
            role: UserRole.SYS_ADMIN,
            featureId: 'object-types',
            canView: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true,
          },
        ],
      };
      mockRepo.bulkUpsertRolePermissions.mockResolvedValue([{ id: 10, ...dto.permissions[0] }]);

      await expect(service.bulkSetRolePermissions(dto)).resolves.toMatchObject({ success: true });
    });

    it('不整合なDB行があっても非SYS_ADMINの実効権限は固定OFFのままであること', async () => {
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        {
          featureId: 'object-types',
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
        { featureId: 'products', canView: true, canCreate: true, canUpdate: true, canDelete: true },
      ]);

      const map = await service.getEffectivePermissionMap(UserRole.WH_USER);

      expect(map.get('object-types')).toMatchObject({
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      });
      // 専用feature以外の overlay は従来どおり効く（過剰な抑制をしていないこと）。
      expect(map.get('products')).toMatchObject({ canCreate: true, canUpdate: true });
    });

    it('不整合なDB行があっても非SYS_ADMINのmy-permissionsへ専用featureを列挙しないこと', async () => {
      mockRepo.findUserById.mockResolvedValue({ id: 'user-9', role: UserRole.WH_USER });
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        {
          featureId: 'object-types',
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      ]);

      const result = await service.getMyPermissions('user-9');

      expect(result.data.permissions.map((permission) => permission.featureId)).not.toContain(
        'object-types',
      );
    });

    it('不整合なDB行があってもpreset読取は403のままであること', async () => {
      mockRepo.findObjectTypeForPermission.mockResolvedValue({ key: 'product', isPreset: true });
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        {
          featureId: 'object-types',
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      ]);

      const map = await service.getEffectivePermissionMap(UserRole.WH_USER);

      await expect(
        service.assertObjectTypePermission(UserRole.WH_USER, 'product', 'view', map),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('SYS_ADMINは専用featureも全action許可のままであること', async () => {
      mockRepo.findRolePermissionsByRole.mockResolvedValue([]);

      const map = await service.getEffectivePermissionMap(UserRole.SYS_ADMIN);

      expect(map.get('object-types')).toMatchObject({
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    });

    it('ユーザー定義台帳ごとの動的権限委任は維持されること', async () => {
      mockRepo.findObjectTypesForPermissions.mockResolvedValue([
        { key: 'project', isPreset: false },
      ]);
      mockRepo.findRolePermissionsByRole.mockResolvedValue([
        {
          featureId: objectTypePermissionId('project'),
          canView: true,
          canCreate: true,
          canUpdate: false,
          canDelete: false,
        },
      ]);

      const map = await service.getEffectivePermissionMap(UserRole.WH_USER);

      expect(map.get(objectTypePermissionId('project'))).toMatchObject({
        canView: true,
        canCreate: true,
      });
    });
  });

  describe('assertObjectTypePermission', () => {
    it('動的台帳は対象actionとviewの両方を要求すること', async () => {
      mockRepo.findObjectTypeForPermission.mockResolvedValue({ key: 'project', isPreset: false });
      const map = new Map([
        [
          objectTypePermissionId('project'),
          { canView: false, canCreate: true, canUpdate: false, canDelete: false },
        ],
      ]);

      await expect(
        service.assertObjectTypePermission(UserRole.WH_USER, 'project', 'create', map),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('presetは従来のobject-types静的権限を使うこと', async () => {
      mockRepo.findObjectTypeForPermission.mockResolvedValue({ key: 'product', isPreset: true });
      const map = new Map([
        ['object-types', { canView: false, canCreate: false, canUpdate: false, canDelete: false }],
      ]);

      await expect(
        service.assertObjectTypePermission(UserRole.WH_USER, 'product', 'view', map),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('キー形式不正は400、未知keyは404にすること', async () => {
      await expect(
        service.assertObjectTypePermission(UserRole.WH_USER, 'Bad_Key', 'view', new Map()),
      ).rejects.toBeInstanceOf(BadRequestException);
      mockRepo.findObjectTypeForPermission.mockResolvedValue(null);
      await expect(
        service.assertObjectTypePermission(UserRole.WH_USER, 'missing', 'view', new Map()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
