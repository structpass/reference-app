import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { TokenDenylistService } from '../services/token-denylist.service';
import { JwtPayload } from '../auth.service';
import { AUTH_COOKIE_NAME } from '../constants/cookie.constants';

function extractJwtFromCookieOrHeader(req: Request): string | null {
  // Cookie優先
  const cookieToken = req?.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) return cookieToken;
  // Bearerヘッダーフォールバック（Swagger/curl/テスト用）
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokenDenylistService: TokenDenylistService,
  ) {
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // jtiは必須 — ない場合はトークンを拒否
    if (!payload.jti) {
      throw new UnauthorizedException('Token missing jti claim');
    }
    const revoked = await this.tokenDenylistService.isRevoked(payload.jti);
    if (revoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
