import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createE2EApp, issueToken, authCookie, SEED_EMAILS } from './helpers/auth.helper';

/**
 * 在庫連動ワークフロー統合テスト
 *
 * テスト対象:
 * 1. 入荷確定 → 在庫増加
 * 2. 出荷確定 → 在庫減少
 * 3. 棚卸確定 → 在庫上書き
 * 4. 伝票ステータス遷移（正常・不正）
 * 5. 確定済み伝票の削除 → 在庫戻し
 */
describe('在庫連動ワークフロー (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let whUserToken: string;

  // テスト用のseedデータID
  let warehouseId: number;
  let productId: string;
  let carrierId: number;
  let supplierId: number;

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);

    adminToken = await issueToken(app, SEED_EMAILS.admin);
    whUserToken = await issueToken(app, SEED_EMAILS.whUser);

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
  // ヘルパー: 在庫数を取得
  // ============================================================
  async function getStockQuantity(whId: number, prdId: string): Promise<number> {
    const stock = await prisma.stock.findUnique({
      where: { warehouseId_productId: { warehouseId: whId, productId: prdId } },
    });
    return stock?.quantity ?? 0;
  }

  // ============================================================
  // 1. 入荷ワークフロー: 作成 → 確定(在庫加算) → 完了
  // ============================================================
  describe('入荷ワークフロー', () => {
    let receivingId: number;
    let stockBefore: number;

    it('入荷伝票を作成できること（DRAFT）', async () => {
      stockBefore = await getStockQuantity(warehouseId, productId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(adminToken))
        .send({
          receivingDate: '2026-03-17',
          warehouseId,
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 10, actualQty: 10 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.receivingNo).toMatch(/^RCV-/);
      receivingId = res.body.data.id;

      // DRAFT では在庫は変わらない
      const stockAfterCreate = await getStockQuantity(warehouseId, productId);
      expect(stockAfterCreate).toBe(stockBefore);
    });

    it('DRAFT の入荷伝票を更新できること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(adminToken))
        .send({
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 15, actualQty: 15 }],
        })
        .expect(200);

      expect(res.body.data.supplierId).toBe(supplierId);
    });

    it('入荷を確定すると在庫が加算されること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.data.status).toBe('CONFIRMED');

      const stockAfterConfirm = await getStockQuantity(warehouseId, productId);
      expect(stockAfterConfirm).toBe(stockBefore + 15);
    });

    it('CONFIRMED の伝票は更新できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(adminToken))
        .send({ supplierId: 999 })
        .expect(400);
    });

    it('CONFIRMED の伝票を再確定できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(400);
    });

    it('入荷を完了にできること（CONFIRMED→COMPLETED）', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}/complete`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('COMPLETED の伝票を完了にできないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}/complete`)
        .set('Cookie', authCookie(adminToken))
        .expect(400);
    });
  });

  // ============================================================
  // 2. 出荷ワークフロー: 作成 → 確定(在庫減算) → 出荷完了
  // ============================================================
  describe('出荷ワークフロー', () => {
    let shipmentId: number;
    let stockBefore: number;

    it('出荷伝票を作成できること（DRAFT）', async () => {
      stockBefore = await getStockQuantity(warehouseId, productId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/shipments')
        .set('Cookie', authCookie(adminToken))
        .send({
          shipmentDate: '2026-03-17',
          warehouseId,
          destination: 'E2Eテスト出荷先',
          carrierId,
          lines: [{ lineNo: 1, productId, plannedQty: 5, actualQty: 5 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      shipmentId = res.body.data.id;
    });

    it('出荷を確定すると在庫が減算されること', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.data.status).toBe('CONFIRMED');

      const stockAfterConfirm = await getStockQuantity(warehouseId, productId);
      expect(stockAfterConfirm).toBe(stockBefore - 5);
    });

    it('CONFIRMED の出荷伝票は更新できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}`)
        .set('Cookie', authCookie(adminToken))
        .send({ destination: '変更不可' })
        .expect(400);
    });

    it('出荷完了にできること（CONFIRMED→SHIPPED）', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}/ship`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.data.status).toBe('SHIPPED');
    });

    it('SHIPPED の伝票を出荷完了にできないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/shipments/${shipmentId}/ship`)
        .set('Cookie', authCookie(adminToken))
        .expect(400);
    });
  });

  // ============================================================
  // 3. 確定済み入荷の削除 → 在庫が戻ること
  // ============================================================
  describe('確定済み入荷の削除と在庫戻し', () => {
    let receivingId: number;
    let stockBefore: number;

    it('入荷を作成・確定して在庫加算', async () => {
      stockBefore = await getStockQuantity(warehouseId, productId);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(adminToken))
        .send({
          receivingDate: '2026-03-17',
          warehouseId,
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 20, actualQty: 20 }],
        })
        .expect(201);

      receivingId = createRes.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/receivings/${receivingId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const stockAfterConfirm = await getStockQuantity(warehouseId, productId);
      expect(stockAfterConfirm).toBe(stockBefore + 20);
    });

    it('確定済み入荷を削除すると在庫が減算されること', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      const stockAfterDelete = await getStockQuantity(warehouseId, productId);
      expect(stockAfterDelete).toBe(stockBefore);
    });
  });

  // ============================================================
  // 4. 権限制御: WH_USER は削除不可
  // ============================================================
  describe('権限制御', () => {
    let receivingId: number;

    it('WH_USER が入荷伝票を作成できること（USER は伝票 CRU・削除のみ不可）', async () => {
      // 権限モデル: 非 admin（WH_USER/OF_USER）は伝票を作成・更新できるが削除はできない
      // （seed/permissions.ts DOCUMENT_FEATURES = 非 admin に CRU）。削除拒否は次テストで担保。
      const res = await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(whUserToken))
        .send({
          receivingDate: '2026-03-17',
          warehouseId,
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 1 }],
        })
        .expect(201);

      expect(res.body.data.status).toBe('DRAFT');
    });

    it('ADMIN が入荷を作成でき、WH_USER が削除できないこと', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/receivings')
        .set('Cookie', authCookie(adminToken))
        .send({
          receivingDate: '2026-03-17',
          warehouseId,
          supplierId,
          lines: [{ lineNo: 1, productId, plannedQty: 1 }],
        })
        .expect(201);

      receivingId = res.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/receivings/${receivingId}`)
        .set('Cookie', authCookie(whUserToken))
        .expect(403);
    });

    it('WH_USER がマスタ（倉庫）を作成できないこと', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Cookie', authCookie(whUserToken))
        .send({ code: 'WH-DENY', name: '拒否テスト倉庫' })
        .expect(403);
    });

    it('WH_USER がマスタ（倉庫）を参照できること', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Cookie', authCookie(whUserToken))
        .expect(200);
    });

    it('認証なしで全APIが401になること', async () => {
      await request(app.getHttpServer()).get('/api/v1/receivings').expect(401);
      await request(app.getHttpServer()).get('/api/v1/shipments').expect(401);
      await request(app.getHttpServer()).get('/api/v1/stocks').expect(401);
    });
  });

  // ============================================================
  // 5. 発注ワークフロー: 作成 → 確定
  // ============================================================
  describe('発注ワークフロー', () => {
    let orderId: number;

    it('発注伝票を作成できること（DRAFT）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', authCookie(adminToken))
        .send({
          orderDate: '2026-03-17',
          supplierId,
          items: [{ lineNo: 1, productId, orderQty: 100, unitPrice: 120000 }],
        })
        .expect(201);

      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.orderNo).toMatch(/^PO-/);
      orderId = res.body.data.id;
    });

    it('発注を確定できること（DRAFT→ORDERED）', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/orders/${orderId}/confirm`)
        .set('Cookie', authCookie(adminToken))
        .expect(200);

      expect(res.body.data.status).toBe('ORDERED');
    });

    it('ORDERED の伝票は更新できないこと', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/orders/${orderId}`)
        .set('Cookie', authCookie(adminToken))
        .send({ supplierId: 999 })
        .expect(400);
    });
  });
});
