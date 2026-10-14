import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createE2EApp, issueToken, authCookie, SEED_EMAILS } from './helpers/auth.helper';

/**
 * 伝票（トランザクション）フロー E2Eテスト
 *
 * テスト対象:
 * 1. 入荷伝票: 作成 → 一覧 → 詳細 → 更新 → 確定 → 完了
 * 2. 出荷伝票: 作成 → 一覧 → 詳細 → 更新 → 確定 → 出荷完了
 * 3. 発注伝票: 作成 → 一覧 → 詳細 → 更新 → 確定
 * 4. 棚卸伝票: 作成 → 一覧 → 詳細 → 更新 → 確定
 * 5. 伝票番号の自動採番
 * 6. バリデーションエラー
 */
describe('伝票フロー (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  // テスト用マスタデータID
  let warehouseId: number;
  let productId: string;
  let carrierId: number;
  let supplierId: number;

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);

    adminToken = await issueToken(app, SEED_EMAILS.admin);

    // テスト用マスタデータのID取得
    const warehouse = await prisma.warehouse.findFirst({ where: { code: 'WH-TOKYO' } });
    warehouseId = warehouse!.id;

    const product = await prisma.product.findFirst({ where: { code: 'PRD-001' } });
    productId = product!.id;

    const carrier = await prisma.carrier.findFirst();
    carrierId = carrier!.id;

    const supplier = await prisma.supplier.findFirst({ where: { code: 'SUP-001' } });
    supplierId = supplier!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // 1. 入荷伝票フロー
  // ============================================================
  describe('入荷伝票フロー', () => {
    let receivingId: number;

    it('POST /api/v1/receivings - 入荷伝票を作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(adminToken))
        .send({
          receivingDate: '2026-03-18',
          warehouseId,
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 25, actualQty: 25 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.receivingNo).toMatch(/^RCV-/);
      expect(res.body.data.supplierId).toBe(supplierId);
      receivingId = res.body.data.id;
    });

    it('GET /api/v1/receivings - 入荷一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/receivings')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/receivings/:id - 入荷詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(receivingId);
      expect(res.body.data.lines).toBeDefined();
      expect(res.body.data.lines.length).toBe(1);
      expect(res.body.data.lines[0].plannedQty).toBe(25);
    });

    it('PUT /api/v1/receivings/:id - DRAFT の入荷伝票を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 30, actualQty: 30 }],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.supplierId).toBe(supplierId);
    });

    it('PUT /api/v1/receivings/:id/confirm - 入荷を確定できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONFIRMED');
    });

    it('PUT /api/v1/receivings/:id - CONFIRMED の入荷伝票は更新できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(adminToken))
        .send({ supplierId: 999 })
        .expect(400);
    });

    it('PUT /api/v1/receivings/:id/complete - 入荷を完了にできること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}/complete`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
    });
  });

  // ============================================================
  // 2. 出荷伝票フロー
  // ============================================================
  describe('出荷伝票フロー', () => {
    let shipmentId: number;

    it('POST /api/v1/shipments - 出荷伝票を作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/shipments')
        .set('Cookie', authCookie(adminToken))
        .send({
          shipmentDate: '2026-03-18',
          warehouseId,
          destination: 'E2E伝票テスト出荷先',
          carrierId,
          lines: [{ lineNo: 1, productId, plannedQty: 3, actualQty: 3 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.shipmentNo).toMatch(/^SHP-/);
      expect(res.body.data.destination).toBe('E2E伝票テスト出荷先');
      shipmentId = res.body.data.id;
    });

    it('GET /api/v1/shipments - 出荷一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/shipments')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/shipments/:id - 出荷詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/shipments/${shipmentId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(shipmentId);
      expect(res.body.data.lines).toBeDefined();
      expect(res.body.data.lines.length).toBe(1);
    });

    it('PUT /api/v1/shipments/:id - DRAFT の出荷伝票を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          destination: 'E2E伝票テスト出荷先（更新）',
          lines: [{ lineNo: 1, productId, plannedQty: 5, actualQty: 5 }],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.destination).toBe('E2E伝票テスト出荷先（更新）');
    });

    it('PUT /api/v1/shipments/:id/confirm - 出荷を確定できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONFIRMED');
    });

    it('PUT /api/v1/shipments/:id - CONFIRMED の出荷伝票は更新できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}`)
        .set('Cookie', authCookie(adminToken))
        .send({ destination: '変更不可' })
        .expect(400);
    });

    it('PUT /api/v1/shipments/:id/ship - 出荷完了にできること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}/ship`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SHIPPED');
    });

    it('PUT /api/v1/shipments/:id/ship - SHIPPED の伝票は出荷完了にできないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}/ship`)
        .set('Cookie', authCookie(adminToken))
        .expect(400);
    });
  });

  // ============================================================
  // 3. 発注伝票フロー
  // ============================================================
  describe('発注伝票フロー', () => {
    let orderId: number;

    it('POST /api/v1/orders - 発注伝票を作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', authCookie(adminToken))
        .send({
          orderDate: '2026-03-18',
          supplierId,
          items: [{ lineNo: 1, productId, orderQty: 200, unitPrice: 8000 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.orderNo).toMatch(/^PO-/);
      expect(res.body.data.supplierId).toBe(supplierId);
      orderId = res.body.data.id;
    });

    it('GET /api/v1/orders - 発注一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/orders/:id - 発注詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].orderQty).toBe(200);
    });

    it('PUT /api/v1/orders/:id - DRAFT の発注伝票を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/orders/${orderId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          supplierId,
          items: [{ lineNo: 1, productId, orderQty: 250, unitPrice: 7500 }],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.supplierId).toBe(supplierId);
    });

    it('PUT /api/v1/orders/:id/confirm - 発注を確定できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/orders/${orderId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ORDERED');
    });

    it('PUT /api/v1/orders/:id - ORDERED の発注伝票は更新できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/orders/${orderId}`)
        .set('Cookie', authCookie(adminToken))
        .send({ supplierId: 999 })
        .expect(400);
    });
  });

  // ============================================================
  // 4. 棚卸伝票フロー
  // ============================================================
  describe('棚卸伝票フロー', () => {
    let stocktakingId: number;

    it('POST /api/v1/stocktakings - 棚卸伝票を作成できること', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stocktakings')
        .set('Cookie', authCookie(adminToken))
        .send({
          stocktakingDate: '2026-03-18',
          warehouseId,
          stocktaker: 'E2Eテスト担当者',
          items: [{ productId, theoreticalQty: 100, actualQty: 98 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.warehouseId).toBe(warehouseId);
      stocktakingId = res.body.data.id;
    });

    it('GET /api/v1/stocktakings - 棚卸一覧を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stocktakings')
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/stocktakings/:id - 棚卸詳細を取得できること', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stocktakings/${stocktakingId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(stocktakingId);
      expect(res.body.data.items).toBeDefined();
    });

    it('PUT /api/v1/stocktakings/:id - DRAFT の棚卸伝票を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/stocktakings/${stocktakingId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          stocktaker: 'E2Eテスト担当者（更新）',
          items: [{ productId, theoreticalQty: 100, actualQty: 95 }],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('PUT /api/v1/stocktakings/:id/confirm - 棚卸を確定できること（在庫上書き）', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/stocktakings/${stocktakingId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONFIRMED');
    });

    it('PUT /api/v1/stocktakings/:id - CONFIRMED の棚卸伝票は更新できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/stocktakings/${stocktakingId}`)
        .set('Cookie', authCookie(adminToken))
        .send({ stocktaker: '変更不可テスト' })
        .expect(400);
    });
  });

  // ============================================================
  // 5. 認証なしアクセス
  // ============================================================
  describe('認証なしで伝票APIにアクセスできないこと', () => {
    it('入荷一覧は401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/receivings').expect(401);
    });

    it('出荷一覧は401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/shipments').expect(401);
    });

    it('発注一覧は401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
    });

    it('棚卸一覧は401エラーになること', async () => {
      await request(app.getHttpServer()).get('/api/v1/stocktakings').expect(401);
    });
  });

  // ============================================================
  // 6. バリデーションエラー
  // ============================================================
  describe('伝票作成時のバリデーション', () => {
    it('入荷伝票 - warehouseId なしで400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(adminToken))
        .send({
          receivingDate: '2026-03-18',
          supplierId,
          lines: [],
        })
        .expect(400);
    });

    it('出荷伝票 - warehouseId なしで400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/shipments')
        .set('Cookie', authCookie(adminToken))
        .send({
          shipmentDate: '2026-03-18',
          destination: 'バリデーションテスト',
          lines: [],
        })
        .expect(400);
    });

    it('発注伝票 - supplierId なしで400エラーになること', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', authCookie(adminToken))
        .send({
          orderDate: '2026-03-18',
          items: [],
        })
        .expect(400);
    });
  });
});
