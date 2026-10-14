import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import {
  createE2EApp,
  issueToken,
  authCookie,
  resolveSeedAccount,
  SEED_EMAILS,
} from './helpers/auth.helper';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /** seed アカウントの実測 email（管理アカウントは開発 DB では IdP の値に更新されている）。 */
  let adminEmail: string;

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);
    adminEmail = (await resolveSeedAccount(app, SEED_EMAILS.admin)).email;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('ヘルスチェックが成功すること', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });

  // SSO 一本化で LocalAuth ログイン（POST /auth/login）は撤去。確立済みセッション（JWT cookie）の
  // 認可のみを検証する。実 SSO 往復は /chk の手動スモークで担保（lightweight 方針）。
  describe('セッション認証（JWT cookie）', () => {
    it('GET /api/v1/auth/me - トークンなしで401エラーになること', () => {
      return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('GET /api/v1/auth/me - 有効なトークンでプロファイルを取得できること', async () => {
      const token = await issueToken(app, SEED_EMAILS.admin);

      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', authCookie(token))
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.email).toBe(adminEmail);
        });
    });
  });

  describe('商品 CRUD', () => {
    let token: string;
    let createdProductId: string;
    let categoryId: number;

    beforeAll(async () => {
      token = await issueToken(app, SEED_EMAILS.admin);
      const category = await prisma.category.findFirst({ where: { code: 'CAT-001' } });
      categoryId = category!.id;
    });

    it('POST /api/v1/products - 商品を作成できること', () => {
      return request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', authCookie(token))
        .send({
          code: `E2E-APP-${Date.now()}`,
          name: 'E2Eテスト商品',
          description: 'E2Eテスト用',
          categoryId,
          price: 9999,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.code).toBeDefined();
          createdProductId = res.body.data.id;
        });
    });

    it('GET /api/v1/products - 商品一覧を取得できること', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(token))
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.meta).toBeDefined();
          expect(res.body.meta.total).toBeGreaterThan(0);
        });
    });

    it('GET /api/v1/products/:id - 商品詳細を取得できること', async () => {
      return request(app.getHttpServer())
        .get(`/api/v1/products/${createdProductId}`)
        .set('Cookie', authCookie(token))
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.id).toBe(createdProductId);
        });
    });

    it('PUT /api/v1/products/:id - 商品を更新できること', async () => {
      return request(app.getHttpServer())
        .put(`/api/v1/products/${createdProductId}`)
        .set('Cookie', authCookie(token))
        .send({ name: 'E2Eテスト商品(更新済)' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.name).toBe('E2Eテスト商品(更新済)');
        });
    });

    it('DELETE /api/v1/products/:id - 商品を削除できること', async () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/products/${createdProductId}`)
        .set('Cookie', authCookie(token))
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });

    it('GET /api/v1/products - 認証なしで401エラーになること', () => {
      return request(app.getHttpServer()).get('/api/v1/products').expect(401);
    });
  });
});
