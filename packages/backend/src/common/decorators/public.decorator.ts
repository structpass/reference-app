import { SetMetadata } from '@nestjs/common';

// 認証不要 endpoint の宣言用 metadata。global JwtAuthGuard が
// `getAllAndOverride(IS_PUBLIC_KEY)` を見て true なら素通しする。
export const IS_PUBLIC_KEY = 'is-public';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
