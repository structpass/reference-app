import request from 'supertest';
import cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { User } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { BOOTSTRAP_ADMIN_SUB, DEMO_SUBS } from '../../prisma/seed/users';

/**
 * seed 済みデモユーザーの email（prisma/seed/users.ts と一致）。
 *
 * これは**引き当てのキーではなく、spec がアカウントを指すためのハンドル**である。利用者の email は
 * Rete ログイン（JIT プロビジョニング）で IdP の値へ更新される可変値なので、引き当てには使えない。
 * 引き当ての正本は {@link SEED_ACCOUNTS} の oidcSub（{@link resolveSeedAccount}）。
 */
export const SEED_EMAILS = {
  admin: 'admin@struct-pass.example', // SYS_ADMIN
  whUser: 'wh-user@struct-pass.example', // WH_USER
  whAdmin: 'wh-admin@struct-pass.example', // WH_ADMIN
  ofUser: 'of-user@struct-pass.example', // OF_USER
  ofAdmin: 'of-admin@struct-pass.example', // OF_ADMIN
} as const;

export type SeedEmail = (typeof SEED_EMAILS)[keyof typeof SEED_EMAILS];

/**
 * seed 済みアカウントの対応表。引き当ての正本は **oidcSub** で、値は prisma/seed/users.ts から
 * import する（写しを作らない）。
 *
 * oidcSub は seed が upsert キーにする identity の対応キー（rete Account.id === OIDC sub ===
 * User.oidcSub）で、ログインで変わらない。email は可変値なので第2候補に留める。
 */
export const SEED_ACCOUNTS = {
  admin: { oidcSub: BOOTSTRAP_ADMIN_SUB, email: SEED_EMAILS.admin },
  whUser: { oidcSub: DEMO_SUBS.whUser, email: SEED_EMAILS.whUser },
  whAdmin: { oidcSub: DEMO_SUBS.whAdmin, email: SEED_EMAILS.whAdmin },
  ofUser: { oidcSub: DEMO_SUBS.ofUser, email: SEED_EMAILS.ofUser },
  ofAdmin: { oidcSub: DEMO_SUBS.ofAdmin, email: SEED_EMAILS.ofAdmin },
} as const;

export type SeedAccountKey = keyof typeof SEED_ACCOUNTS;
/** アカウントの指し方（鍵 or seed email）。既存の spec は seed email で指している。 */
export type SeedAccountHandle = SeedAccountKey | SeedEmail;

function accountKeyOf(handle: SeedAccountHandle): SeedAccountKey {
  if (handle in SEED_ACCOUNTS) return handle as SeedAccountKey;
  const keys = Object.keys(SEED_ACCOUNTS) as SeedAccountKey[];
  const found = keys.find((key) => SEED_ACCOUNTS[key].email === handle);
  if (!found) {
    throw new Error(
      `e2e: unknown seed account handle: ${handle}. Pass a key of SEED_ACCOUNTS or a value of SEED_EMAILS.`,
    );
  }
  return found;
}

/**
 * seed 済みアカウントを **oidcSub で** 引き当て、DB の実ユーザー行を返す。
 *
 * 返る行の email は DB の実測値（管理アカウントは開発 DB では IdP の値に更新されている）。
 * seed の email と比較したい時は {@link SEED_ACCOUNTS} の email ではなく、返った行の email を使う。
 * oidcSub で引けない環境（sub を持たない行）のために seed email を第2候補にする。
 */
export async function resolveSeedAccount(
  app: INestApplication,
  handle: SeedAccountHandle,
): Promise<User> {
  const key = accountKeyOf(handle);
  const account = SEED_ACCOUNTS[key];
  const prisma = app.get(PrismaService);

  const byOidcSub = await prisma.user.findUnique({ where: { oidcSub: account.oidcSub } });
  if (byOidcSub) return byOidcSub;

  const byEmail = await prisma.user.findUnique({ where: { email: account.email } });
  if (byEmail) return byEmail;

  throw new Error(
    `e2e: seed user not found for ${key} (oidcSub=${account.oidcSub}, email=${account.email}). Run \`pnpm prisma db seed\` before the e2e suite.`,
  );
}

/** Set-Cookieヘッダーからsp_access_tokenの値を取得 */
export function extractCookie(res: request.Response): string {
  const setCookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const match = setCookies.find((c: string) => c.startsWith('sp_access_token='));
  if (!match) return '';
  return match.split(';')[0].split('=').slice(1).join('=');
}

/**
 * seed 済みユーザーの reference 自前 JWT（=Cookie値）を直接発行する。
 *
 * 引き当ては {@link resolveSeedAccount}（oidcSub が正本）が行う。利用者の email は Rete ログイン
 * （JIT）で IdP の値へ更新されるため、email では引き当てない。
 *
 * SSO 一本化で LocalAuth ログイン（POST /auth/login）は撤去されたため、e2e は OIDC 往復を踏まず
 * JWT を直接発行して「認証済みセッション」を再現する。実 SSO 往復（rete /authorize → callback →
 * JIT → 承認）は自動 e2e では検証せず、/chk の手動スモークで担保する（spec §12 / lightweight 方針）。
 */
export async function issueToken(
  app: INestApplication,
  handle: SeedAccountHandle = 'admin',
): Promise<string> {
  const authService = app.get(AuthService);
  return authService.issueJwt(await resolveSeedAccount(app, handle));
}

/** テスト用: スロットルカウントを常に0で返すストレージ */
const noopThrottlerStorage = {
  increment: async () => ({
    totalHits: 0,
    timeToExpire: 0,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
  storage: new Map(),
  get: async () => [],
};

/** E2E用のNestApplicationを初期化（スロットル無効） */
export async function createE2EApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(getStorageToken())
    .useValue(noopThrottlerStorage)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

/** Cookie認証付きリクエストヘルパー */
export function authCookie(token: string): string {
  return `sp_access_token=${token}`;
}
