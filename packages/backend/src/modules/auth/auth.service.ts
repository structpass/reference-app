import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';

/**
 * reference 自前セッションの JWT payload。
 * SSO 一本化に伴い username / role は載せない。authZ は jwt.strategy が
 * リクエスト毎に DB から引き直す role を使うため、payload に role を持つ必要がない
 * （role 付与/剥奪が即時反映され、トークン再発行が不要になる）。
 */
export interface JwtPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * OIDC callback で確定した user に対し reference 自前の JWT を発行する。
   * 以降のリクエストはこの JWT/cookie で認可を回し、rete には都度問い合わせない（spec §3.1）。
   */
  issueJwt(user: { id: string }): string {
    const payload: JwtPayload = { sub: user.id, jti: randomUUID() };
    return this.jwtService.sign(payload);
  }

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
