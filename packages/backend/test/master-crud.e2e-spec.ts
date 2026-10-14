import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createE2EApp, issueToken, authCookie, SEED_EMAILS } from './helpers/auth.helper';

/**
 * マスタデータ CRUD E2Eテスト
 *
 * テスト対象:
 * 1. 商品 CRUD（作成→一覧→詳細→更新→削除）
 * 2. 倉庫 CRUD（作成→一覧→詳細→更新→削除）
 * 3. 運送会社 CRUD（作成→一覧→詳細→更新→削除）
 * 4. ユーザー CRUD（作成→一覧→詳細→更新→削除）
 * 5. グループ CRUD（作成→一覧→詳細→更新→削除→メンバー管理）
 * 6. バリデーションエラー
 */
describe('マスタデータ CRUD (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2EApp();
    adminToken = await issueToken(app, SEED_EMAILS.admin);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // 1. 商品 CRUD
  // ============================================================
  describe('商品 CRUD', () => {
    let createdId: string;
    let categoryId: number;

    beforeAll(async () => {
      const category = await prisma.category.findFirst({ where: { code: 'CAT-001' } });
      categoryId = category!.id;
    });

    it('POST /api/v1/products - 商品を作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', authCookie(adminToken))
        .send({
          code: 'E2E-MST-001',
          name: 'E2Eマスタテスト商品',
          description: 'マスタCRUDテスト用商品',
          categoryId,
          price: 12000,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('E2E-MST-001');
      expect(res.body.data.name).toBe('E2Eマスタテスト商品');
      expect(res.body.data.id).toBeDefined();
      createdId = res.body.data.id;
    });

    it('GET /api/v1/products - 商品一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/products/:id - 商品詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
      expect(res.body.data.code).toBe('E2E-MST-001');
    });

    it('PUT /api/v1/products/:id - 商品を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/products/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          name: 'E2Eマスタテスト商品（更新済）',
          price: 15000,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2Eマスタテスト商品（更新済）');
      expect(Number(res.body.data.price)).toBe(15000);
    });

    it('POST /api/v1/products - 必須フィールド不足で400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', authCookie(adminToken))
        .send({ name: 'コード欠損商品' })
        .expect(400);
    });

    it('DELETE /api/v1/products/:id - 商品を削除できること', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/products/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /api/v1/products/:id - 削除済み商品は取得できないこと', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(404);
    });
  });

  // ============================================================
  // 2. 倉庫 CRUD
  // ============================================================
  describe('倉庫 CRUD', () => {
    let createdId: number;

    it('POST /api/v1/warehouses - 倉庫を作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Cookie', authCookie(adminToken))
        .send({
          code: 'WH-E2E-001',
          name: 'E2Eテスト倉庫',
          address: '東京都千代田区テスト町1-1',
          phone: '03-1234-5678',
          manager: 'テスト管理者',
          capacity: 1000,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('WH-E2E-001');
      expect(res.body.data.name).toBe('E2Eテスト倉庫');
      expect(res.body.data.address).toBe('東京都千代田区テスト町1-1');
      expect(res.body.data.id).toBeDefined();
      createdId = res.body.data.id;
    });

    it('GET /api/v1/warehouses - 倉庫一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/warehouses/:id - 倉庫詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/warehouses/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
      expect(res.body.data.code).toBe('WH-E2E-001');
    });

    it('PUT /api/v1/warehouses/:id - 倉庫を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/warehouses/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          name: 'E2Eテスト倉庫（更新済）',
          capacity: 2000,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2Eテスト倉庫（更新済）');
    });

    it('POST /api/v1/warehouses - 必須フィールド不足で400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Cookie', authCookie(adminToken))
        .send({ name: 'コード欠損倉庫' })
        .expect(400);
    });

    it('DELETE /api/v1/warehouses/:id - 倉庫を削除できること', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/warehouses/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ============================================================
  // 3. 運送会社 CRUD
  // ============================================================
  describe('運送会社 CRUD', () => {
    let createdId: number;

    it('POST /api/v1/carriers - 運送会社を作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/carriers')
        .set('Cookie', authCookie(adminToken))
        .send({
          code: 'CR-E2E-001',
          name: 'E2Eテスト運送',
          address: '大阪府大阪市テスト区2-2',
          phone: '06-9876-5432',
          contactPerson: 'テスト担当',
          email: 'e2e-carrier@test.example.com',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('CR-E2E-001');
      expect(res.body.data.name).toBe('E2Eテスト運送');
      expect(res.body.data.id).toBeDefined();
      createdId = res.body.data.id;
    });

    it('GET /api/v1/carriers - 運送会社一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/carriers')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/carriers/:id - 運送会社詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/carriers/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
      expect(res.body.data.code).toBe('CR-E2E-001');
    });

    it('PUT /api/v1/carriers/:id - 運送会社を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/carriers/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          name: 'E2Eテスト運送（更新済）',
          phone: '06-1111-2222',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2Eテスト運送（更新済）');
    });

    it('POST /api/v1/carriers - 必須フィールド不足で400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/carriers')
        .set('Cookie', authCookie(adminToken))
        .send({ name: 'コード欠損運送会社' })
        .expect(400);
    });

    it('DELETE /api/v1/carriers/:id - 運送会社を削除できること', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/carriers/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ============================================================
  // 4. ユーザー CRUD
  // ============================================================
  describe('ユーザー CRUD', () => {
    let createdId: string;

    it('POST /api/v1/users - ユーザーを作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', authCookie(adminToken))
        .send({
          name: 'E2Eテストユーザー',
          email: 'e2e-test@test.example.com',
          role: 'WH_USER',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2Eテストユーザー');
      expect(res.body.data.email).toBe('e2e-test@test.example.com');
      expect(res.body.data.id).toBeDefined();
      createdId = res.body.data.id;
    });

    it('GET /api/v1/users - ユーザー一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/users/:id - ユーザー詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
      expect(res.body.data.name).toBe('E2Eテストユーザー');
    });

    it('PUT /api/v1/users/:id - ユーザーを更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/users/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          email: 'e2e-updated@test.example.com',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('e2e-updated@test.example.com');
    });

    it('POST /api/v1/users - メールアドレス形式が不正だと400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', authCookie(adminToken))
        .send({
          name: '不正メールユーザー',
          email: 'invalid-email',
        })
        .expect(400);
    });

    it('DELETE /api/v1/users/:id - ユーザーを削除できること', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ============================================================
  // 5. グループ CRUD + メンバー管理
  // ============================================================
  describe('グループ CRUD', () => {
    let createdId: number;

    it('POST /api/v1/groups - グループを作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', authCookie(adminToken))
        .send({
          code: 'GRP-E2E-001',
          name: 'E2Eテストグループ',
          description: 'E2Eテスト用グループ',
          role: 'WH_USER',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('GRP-E2E-001');
      expect(res.body.data.name).toBe('E2Eテストグループ');
      expect(res.body.data.id).toBeDefined();
      createdId = res.body.data.id;
    });

    it('GET /api/v1/groups - グループ一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/groups/:id - グループ詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
      expect(res.body.data.code).toBe('GRP-E2E-001');
    });

    it('PUT /api/v1/groups/:id - グループを更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/groups/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          name: 'E2Eテストグループ（更新済）',
          description: '更新後の説明',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2Eテストグループ（更新済）');
    });

    it('GET /api/v1/groups/:id/members - グループメンバー一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${createdId}/members`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/v1/groups - 必須フィールド不足で400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', authCookie(adminToken))
        .send({ name: 'ロール欠損グループ' })
        .expect(400);
    });

    it('DELETE /api/v1/groups/:id - グループを削除できること', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/groups/${createdId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ============================================================
  // 6. 認証なしアクセス
  // ============================================================
  describe('認証なしアクセス', () => {
    it('認証なしで商品一覧にアクセスすると401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/products').expect(401);
    });

    it('認証なしで倉庫一覧にアクセスすると401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/warehouses').expect(401);
    });

    it('認証なしで運送会社一覧にアクセスすると401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/carriers').expect(401);
    });

    it('認証なしでユーザー一覧にアクセスすると401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });

    it('認証なしでグループ一覧にアクセスすると401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/groups').expect(401);
    });
  });
});
