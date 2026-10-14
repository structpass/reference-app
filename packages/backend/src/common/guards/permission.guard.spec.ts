import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PermissionGuard } from './permission.guard';
import type { PermissionsService } from '../../modules/permissions/permissions.service';
import type { FeaturePermission } from '../../modules/permissions/constants/role-permissions.constants';

describe('PermissionGuard', () => {
  let reflector: Reflector;
  let service: jest.Mocked<
    Pick<PermissionsService, 'getEffectivePermissionMap' | 'assertObjectTypePermission'>
  >;
  let guard: PermissionGuard;

  const buildMap = (entries: Record<string, FeaturePermission>) => new Map(Object.entries(entries));

  const ctx = (user: { role: UserRole } | undefined, req?: Record<string | symbol, unknown>) => {
    const request = req ?? { user };
    if (req && !('user' in req)) {
      request.user = user;
    }
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  // PermissionGuard は reflector.getAllAndOverride を 2 つの key で呼ぶ。
  // - 'is-public': @Public() 短絡判定
  // - 'require-permission': metadata 本体
  const setMeta = (opts: {
    isPublic?: boolean;
    perm?: { featureId: string; action: 'view' | 'create' | 'update' | 'delete' };
  }) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === 'is-public') return opts.isPublic;
      if (key === 'require-permission') return opts.perm;
      return undefined;
    });
  };

  beforeEach(() => {
    reflector = new Reflector();
    service = {
      getEffectivePermissionMap: jest.fn(),
      assertObjectTypePermission: jest.fn(),
    };
    guard = new PermissionGuard(reflector, service as unknown as PermissionsService);
  });

  it('metadata が無ければ素通し（permission 要求なし endpoint）', async () => {
    setMeta({});
    await expect(guard.canActivate(ctx({ role: UserRole.WH_USER }))).resolves.toBe(true);
    expect(service.getEffectivePermissionMap).not.toHaveBeenCalled();
  });

  it('@Public() 付きなら req.user が無くても短絡で true（@RequirePermission との誤併用防御）', async () => {
    setMeta({ isPublic: true, perm: { featureId: 'users', action: 'view' } });
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
    expect(service.getEffectivePermissionMap).not.toHaveBeenCalled();
  });

  it('user が undefined なら fail-closed（ForbiddenException）', async () => {
    setMeta({ perm: { featureId: 'users', action: 'view' } });
    await expect(guard.canActivate(ctx(undefined))).rejects.toThrow(ForbiddenException);
  });

  it('matrix で許可されていれば true', async () => {
    setMeta({ perm: { featureId: 'users', action: 'view' } });
    service.getEffectivePermissionMap.mockResolvedValue(
      buildMap({
        users: { canView: true, canCreate: false, canUpdate: false, canDelete: false },
      }),
    );
    await expect(guard.canActivate(ctx({ role: UserRole.WH_USER }))).resolves.toBe(true);
  });

  it('matrix で拒否されていれば ForbiddenException', async () => {
    setMeta({ perm: { featureId: 'users', action: 'create' } });
    service.getEffectivePermissionMap.mockResolvedValue(
      buildMap({
        users: { canView: true, canCreate: false, canUpdate: false, canDelete: false },
      }),
    );
    await expect(guard.canActivate(ctx({ role: UserRole.WH_USER }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('featureId が matrix に存在しない場合は fail-closed', async () => {
    setMeta({ perm: { featureId: 'unknown-feature', action: 'view' } });
    service.getEffectivePermissionMap.mockResolvedValue(buildMap({}));
    await expect(guard.canActivate(ctx({ role: UserRole.WH_USER }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('同一リクエスト内で複数 endpoint を経由しても getEffectivePermissionMap は 1 回のみ', async () => {
    setMeta({ perm: { featureId: 'users', action: 'view' } });
    service.getEffectivePermissionMap.mockResolvedValue(
      buildMap({
        users: { canView: true, canCreate: false, canUpdate: false, canDelete: false },
      }),
    );
    const req: Record<string, unknown> = {};
    const context = ctx({ role: UserRole.WH_USER }, req);
    await guard.canActivate(context);
    await guard.canActivate(context);
    expect(service.getEffectivePermissionMap).toHaveBeenCalledTimes(1);
  });

  it('SYS_ADMIN は service が全許可 map を返すので全 endpoint で true', async () => {
    setMeta({ perm: { featureId: 'users', action: 'delete' } });
    service.getEffectivePermissionMap.mockResolvedValue(
      buildMap({
        users: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
      }),
    );
    await expect(guard.canActivate(ctx({ role: UserRole.SYS_ADMIN }))).resolves.toBe(true);
  });

  it('ObjectType metadata は route key と action を service の動的判定へ渡す', async () => {
    setMeta({});
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === 'is-public') return undefined;
      if (key === 'require-permission') {
        return { kind: 'object-type', keyParam: 'key', action: 'create' };
      }
      return undefined;
    });
    const map = buildMap({});
    service.getEffectivePermissionMap.mockResolvedValue(map);
    const request = { user: { role: UserRole.WH_USER }, params: { key: 'project' } };

    await expect(guard.canActivate(ctx(request.user, request))).resolves.toBe(true);
    expect(service.assertObjectTypePermission).toHaveBeenCalledWith(
      UserRole.WH_USER,
      'project',
      'create',
      map,
    );
  });

  it('ObjectType metadata に route key が無ければ400で止める', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === 'require-permission') {
        return { kind: 'object-type', keyParam: 'key', action: 'view' };
      }
      return undefined;
    });
    service.getEffectivePermissionMap.mockResolvedValue(buildMap({}));

    await expect(
      guard.canActivate(ctx({ role: UserRole.WH_USER }, { user: { role: UserRole.WH_USER } })),
    ).rejects.toThrow('ObjectType key is required');
  });
});
