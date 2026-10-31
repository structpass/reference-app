import { Controller, Post, Get, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { TokenDenylistService } from './services/token-denylist.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AUTH_COOKIE_NAME, getCookieOptions } from './constants/cookie.constants';

// 認証は global APP_GUARD の JwtAuthGuard で実施。SSO ログインは OidcController（@Public）が担い、
// 本 controller は確立済みセッションの logout / me を提供する（login / change-password は SSO 化で撤去）。
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly tokenDenylistService: TokenDenylistService,
  ) {}

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ログアウト' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // トークンを denylist に追加（jti revocation）
    const token =
      req.cookies?.[AUTH_COOKIE_NAME] ?? req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = this.jwtService.verify<{ jti: string; exp: number }>(token);
        if (decoded.jti && decoded.exp) {
          await this.tokenDenylistService.revoke(decoded.jti, new Date(decoded.exp * 1000));
        }
      } catch {
        // 検証失敗しても cookie は削除する
      }
    }
    res.clearCookie(AUTH_COOKIE_NAME, getCookieOptions());
    return {
      success: true,
      data: { message: 'Logged out successfully' },
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '現在のユーザー情報取得' })
  async getProfile(@CurrentUser('id') userId: string) {
    const profile = await this.authService.getProfile(userId);
    return {
      success: true,
      data: profile,
    };
  }
}
