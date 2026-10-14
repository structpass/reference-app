import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * `@RequireRole(...roles)` を付けた endpoint で hard-coded に role を判定する Guard。
 *
 * 用途: bootstrap 問題回避（permission matrix 自体を編集する `permissions` controller や
 * `system-parameters` controller の固定権限）。
 *
 * - metadata が無ければ素通し
 * - user が request に乗っていなければ fail-closed
 * - user の role が allowlist に含まれていなければ ForbiddenException
 */
@Injectable()
export class RequireRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // @Public() 付き endpoint は JwtAuthGuard で素通しになる結果 req.user が無い。
    // 想定外の併用での 403 を避けるため、@Public() があれば metadata に関わらず短絡で許可する。
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: { role?: UserRole } }>();
    if (!user || !user.role) {
      throw new ForbiddenException('Permission denied');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Permission denied');
    }

    return true;
  }
}
