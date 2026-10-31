import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createE2EApp, issueToken, resolveSeedAccount, SEED_EMAILS } from './helpers/auth.helper';

/**
 * 認証セッション E2Eテスト（Cookie方式 / SSO 一本化後）
 *
 * SSO 化により LocalAuth ログイン（POST /auth/login）と change-password は撤去された。
 * ログイン確立は rete との OIDC 往復（OidcController）が担うため、本 spec では実 SSO 往復を踏まず
 * {@link issueToken} で JWT/cookie を直接発行して「認証済みセッション」を再現し、確立後の挙動を検証する:
 *   1. プロファイル取得（Cookie / Bearer フォールバック / 異常系）
 *   2. ログアウト（jti denylist による無効化 + Cookie 削除）
 *   3. 複数ロールのプロファイル差分
 *   4. ロールベースアクセス制御
 * 実 SSO 往復（rete /authorize → callback → JIT → 承認）は /chk の手動スモークで担保する（spec §12）。
 */
describe('認証セッション (e2e)', () => {
  let app: INestApplication;
  /** seed アカウントの実測 email（管理アカウントは開発 DB では IdP の値に更新されている）。 */
  let adminEmail: string;
  let whUserEmail: string;

  beforeAll(async () => {
    app = await createE2EApp();
    adminEmail = (await resolveSeedAccount(app, SEED_EMAILS.admin)).email;
    whUserEmail = (await resolveSeedAccount(app, SEED_EMAILS.whUser)).email;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // 1. プロファイル取得
  // ============================================================
  describe('GET /api/v1/auth/me', () => {
    it('Cookie内のトークンでプロファイルを取得できること', async () => {
      const token = await issueToken(app, SEED_EMAILS.admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `sp_access_token=${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(adminEmail);
      expect(res.body.data.role).toBe('SYS_ADMIN');
    });

    it('Bearerヘッダーでもプロファイルを取得できること（フォールバック）', async () => {
      const token = await issueToken(app, SEED_EMAILS.admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(adminEmail);
    });

    it('トークンなしで401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('無効なトークンで401エラーになること', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', 'sp_access_token=invalid-token-string')
        .expect(401);
    });

    it('不正なAuthorizationヘッダー形式で401エラーになること', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'InvalidScheme token')
        .expect(401);
    });
  });

  // ============================================================
  // 2. ログアウト（トークン無効化 + Cookie削除）
  // ============================================================
  describe('POST /api/v1/auth/logout', () => {
    it('ログアウトが成功し、Cookie削除指示が返ること', async () => {
      const token = await issueToken(app, SEED_EMAILS.admin);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `sp_access_token=${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Set-CookieでCookie削除指示があること
      const setCookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      const clearCookie = setCookies
        .flatMap((c: string) => c.split(','))
        .find((c: string) => c.trim().startsWith('sp_access_token='));
      expect(clearCookie).toBeDefined();
    });

    it('ログアウト後、同じトークンでアクセスすると401になること（トークン無効化）', async () => {
      const token = await issueToken(app, SEED_EMAILS.admin);

      // ログアウト
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `sp_access_token=${token}`)
        .expect(200);

      // 同じトークンでプロファイル取得を試みる → 401（jti denylist）
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `sp_access_token=${token}`)
        .expect(401);
    });

    it('トークンなしでログアウトすると401エラーになること', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);
    });
  });

  // ============================================================
  // 3. 複数ロールのプロファイル差分
  // ============================================================
  describe('複数ロールのプロファイル', () => {
    it('異なるロールのユーザーで異なるプロファイルが返ること', async () => {
      const adminToken = await issueToken(app, SEED_EMAILS.admin);
      const whUserToken = await issueToken(app, SEED_EMAILS.whUser);

      const adminProfile = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `sp_access_token=${adminToken}`)
        .expect(200);

      const whUserProfile = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `sp_access_token=${whUserToken}`)
        .expect(200);

      expect(adminProfile.body.data.email).toBe(adminEmail);
      expect(adminProfile.body.data.role).toBe('SYS_ADMIN');
      expect(whUserProfile.body.data.email).toBe(whUserEmail);
      expect(whUserProfile.body.data.role).toBe('WH_USER');
      expect(adminProfile.body.data.id).not.toBe(whUserProfile.body.data.id);
    });
  });

  // ============================================================
  // 4. ロールベースアクセス制御
  // ============================================================
  describe('ロールベースアクセス制御', () => {
    it('WH_USERロールでDELETE /productsにアクセスすると403になること', async () => {
      const token = await issueToken(app, SEED_EMAILS.whUser);

      await request(app.getHttpServer())
        .delete('/api/v1/products/dummy-id')
        .set('Cookie', `sp_access_token=${token}`)
        .expect(403);
    });

    it('SYS_ADMINロールでGET /productsにアクセスできること', async () => {
      const token = await issueToken(app, SEED_EMAILS.admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', `sp_access_token=${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
