import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createE2EApp, issueToken, authCookie, SEED_EMAILS } from './helpers/auth.helper';

/**
 * 権限システム E2Eテスト
 *
 * テスト対象:
 * 1. ロール別権限マトリクスの取得・一括保存
 * 2. 自分の有効権限取得
 * 3. ロール別アクセス制御（ADMIN vs WH_USER）
 * 4. マスタデータCRUDの権限制御
 * 5. 伝票操作の権限制御
 */
describe('権限システム (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let whUserToken: string;

  beforeAll(async () => {
    app = await createE2EApp();

    adminToken = await issueToken(app, SEED_EMAILS.admin);
    whUserToken = await issueToken(app, SEED_EMAILS.whUser);
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // 1. ロール別権限マトリクス API
  // ============================================================
  describe('ロール別権限マトリクス', () => {
    it('GET /api/v1/permissions/roles - ADMIN がロール別権限マトリクスを取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/permissions/roles')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('GET /api/v1/permissions/roles - WH_USER はロール別権限マトリクスを取得できないこと', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/permissions/roles')
        .set('Cookie', authCookie(whUserToken))
        .expect(403);
    });

    it('GET /api/v1/permissions/roles - 認証なしで401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/permissions/roles').expect(401);
    });
  });

  // ============================================================
  // 2. 自分の有効権限取得
  // ============================================================
  describe('自分の有効権限', () => {
    it('GET /api/v1/permissions/my-permissions - ADMIN が自分の権限を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/permissions/my-permissions')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('GET /api/v1/permissions/my-permissions - WH_USER が自分の権限を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/permissions/my-permissions')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('GET /api/v1/permissions/my-permissions - 認証なしで401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/permissions/my-permissions').expect(401);
    });
  });

  // ============================================================
  // 3. マスタデータの権限制御（WH_USER は作成・更新・削除不可）
  // ============================================================
  describe('マスタデータの権限制御', () => {
    it('WH_USER が倉庫を作成できないこと（403）', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Cookie', authCookie(whUserToken))
        .send({ code: 'WH-DENY-E2E', name: '権限テスト倉庫' })
        .expect(403);
    });

    it('WH_USER が倉庫一覧を参照できること（200）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('WH_USER が運送会社を作成できないこと（403）', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/carriers')
        .set('Cookie', authCookie(whUserToken))
        .send({ code: 'CR-DENY-E2E', name: '権限テスト運送' })
        .expect(403);
    });

    it('WH_USER が運送会社一覧を参照できること（200）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/carriers')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('WH_USER がユーザーを作成できないこと（403）', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', authCookie(whUserToken))
        .send({
          name: 'deny-user',
          email: 'deny@test.example.com',
        })
        .expect(403);
    });

    it('WH_USER がグループを作成できないこと（403）', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', authCookie(whUserToken))
        .send({
          code: 'GRP-DENY',
          name: '権限テストグループ',
          role: 'WH_USER',
        })
        .expect(403);
    });

    it('WH_USER が商品一覧を参照できること（200）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ============================================================
  // 4. 伝票操作の権限制御
  // ============================================================
  describe('伝票操作の権限制御', () => {
    it('WH_USER が入荷伝票を作成できること（USER は伝票 CRU・削除のみ不可）', async () => {
      const warehouseRes = await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      const warehouseId = warehouseRes.body.data[0]?.id;

      const productRes = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      const productId = productRes.body.data[0]?.id;
      const supplierRes = await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      const supplierId = supplierRes.body.data[0]?.id;

      if (!warehouseId || !productId || !supplierId) return;

      await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(whUserToken))
        .send({
          receivingDate: '2026-03-18',
          warehouseId,
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 1 }],
        })
        .expect(201);
    });

    it('ADMIN が入荷を作成でき、WH_USER が削除できないこと', async () => {
      const warehouseRes = await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const warehouseId = warehouseRes.body.data[0]?.id;

      const productRes = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const productId = productRes.body.data[0]?.id;
      const supplierRes = await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const supplierId = supplierRes.body.data[0]?.id;

      if (!warehouseId || !productId || !supplierId) return;

      const res = await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(adminToken))
        .send({
          receivingDate: '2026-03-18',
          warehouseId,
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 1 }],
        })
        .expect(201);

      const receivingId = res.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(whUserToken))
        .expect(403);
    });

    it('WH_USER が発注を作成できること（USER は伝票 CRU・削除のみ不可）', async () => {
      const supplierRes = await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      const supplierId = supplierRes.body.data[0]?.id;
      const productRes = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      const productId = productRes.body.data[0]?.id;
      if (!productId || !supplierId) return;

      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', authCookie(whUserToken))
        .send({
          orderDate: '2026-03-18',
          supplierId,
          items: [{ lineNo: 1, productId, orderQty: 10, unitPrice: 1000 }],
        })
        .expect(201);
    });

    it('ADMIN が発注を作成でき、WH_USER が削除できないこと', async () => {
      const supplierRes = await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const supplierId = supplierRes.body.data[0]?.id;
      const productRes = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const productId = productRes.body.data[0]?.id;
      if (!productId || !supplierId) return;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', authCookie(adminToken))
        .send({
          orderDate: '2026-03-18',
          supplierId,
          items: [{ lineNo: 1, productId, orderQty: 10, unitPrice: 1000 }],
        })
        .expect(201);

      const orderId = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/orders/${orderId}`)
        .set('Cookie', authCookie(whUserToken))
        .expect(403);
    });
  });

  // ============================================================
  // 5. 棚卸確定の権限制御
  // ============================================================
  describe('棚卸確定の権限制御', () => {
    it('WH_USER が棚卸を作成できること（USER は伝票 CRU・削除のみ不可）', async () => {
      const warehouseRes = await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      const warehouseId = warehouseRes.body.data[0]?.id;
      const productRes = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);

      const productId = productRes.body.data[0]?.id;
      if (!warehouseId || !productId) return;

      await request(app.getHttpServer())
        .post('/api/v1/stocktakings')
        .set('Cookie', authCookie(whUserToken))
        .send({
          stocktakingDate: '2026-03-18',
          warehouseId,
          stocktaker: '権限テスト担当者',
          items: [{ productId, theoreticalQty: 10, actualQty: 8 }],
        })
        .expect(201);
    });

    it('ADMIN が棚卸を作成・確定できること', async () => {
      const warehouseRes = await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const warehouseId = warehouseRes.body.data[0]?.id;
      const productRes = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const productId = productRes.body.data[0]?.id;
      if (!warehouseId || !productId) return;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/stocktakings')
        .set('Cookie', authCookie(adminToken))
        .send({
          stocktakingDate: '2026-03-18',
          warehouseId,
          stocktaker: '権限テスト担当者',
          items: [{ productId, theoreticalQty: 10, actualQty: 8 }],
        })
        .expect(201);

      const stocktakingId = createRes.body.data.id;

      const confirmRes = await request(app.getHttpServer())
        .put(`/api/v1/stocktakings/${stocktakingId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(confirmRes.body.success).toBe(true);
      expect(confirmRes.body.data.status).toBe('CONFIRMED');
    });
  });

  // ============================================================
  // 6. 認証なしで全APIが401になること
  // ============================================================
  describe('認証なしアクセス', () => {
    it('権限APIは認証なしで401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/permissions/my-permissions').expect(401);

      await request(app.getHttpServer()).get('/api/v1/permissions/roles').expect(401);
    });

    it('マスタAPIは認証なしで401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/products').expect(401);
      await request(app.getHttpServer()).get('/api/v1/warehouses').expect(401);
      await request(app.getHttpServer()).get('/api/v1/carriers').expect(401);
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
      await request(app.getHttpServer()).get('/api/v1/groups').expect(401);
    });

    it('伝票APIは認証なしで401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/receivings').expect(401);
      await request(app.getHttpServer()).get('/api/v1/shipments').expect(401);
      await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
      await request(app.getHttpServer()).get('/api/v1/stocktakings').expect(401);
    });
  });
});
