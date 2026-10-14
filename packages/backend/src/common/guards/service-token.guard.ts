import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * 機械呼び出し専用の共有 credential（secret）ガード（ref-0095・hom-0067 の消費先）。
 *
 * 用途: ユーザー JWT（Cookie / Bearer）とは別系統のサービス認証で、ObjectType 一覧などの
 * 読み取り専用受口を守る。グローバル JwtAuthGuard の対象外にするため、使う側は
 * `@Public()` + `@UseGuards(ServiceTokenGuard)` を併用する（ユーザー認証と機械認証を混在させない）。
 *
 * - env var `INTEGRATION_SERVICE_TOKEN` を期待値にする。
 * - **fail-closed**: env 未設定時は常に拒否（無効化）＝うっかり開放を防ぐ（criteria【3】）。
 * - timing-safe 比較: `timingSafeEqual` は長さ不一致で throw するため、SHA-256 で両辺を
 *   同長の digest へ正規化してから比較する（タイミングサイドチャネルと throw を同時に防ぐ。
 *   repo 内に先例がない `node:crypto` 標準の持ち込みだが、secret 比較の規律に揃える）。
 * - token はログ出力・エラー応答・リクエスト応答に出さない（criteria【5】）。
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTEGRATION_SERVICE_TOKEN;
    if (!expected) {
      // fail-closed: 未設定時は受口を常に拒否（受口の無効化）。
      throw new UnauthorizedException('Unauthorized');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const provided = request.headers['x-service-token'];

    if (typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!safeEqualStrings(provided, expected)) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}

/** 両辺を SHA-256 で同長 digest にし、timingSafeEqual で比較する（長さ不一致の throw を回避）。 */
function safeEqualStrings(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a).digest();
  const bHash = createHash('sha256').update(b).digest();
  return timingSafeEqual(aHash, bHash);
}
