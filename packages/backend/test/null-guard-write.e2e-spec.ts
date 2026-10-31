import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createE2EApp, issueToken, authCookie, SEED_EMAILS } from './helpers/auth.helper';
import {
  cleanupCreatedDocuments,
  deleteCreatedMasters,
  newCreatedDocumentIds,
  restoreStocks,
  runE2ECleanup,
  snapshotStocks,
  type StockSnapshot,
} from './helpers/e2e-cleanup.helper';

/**
 * v2-456: 書き込み API に「入れられない値（`null`）」を送った時の応答の回帰テスト。
 *
 * 根因は `@IsOptional()` が `null` と `undefined` の両方で検証を飛ばすこと（および
 * `PartialType` が全項目へ `@IsOptional()` を付けること）。JSON の明示 `null` が
 * service → repository → Prisma まで届き、DB の非 null 列で
 * `Argument ... must not be null` の 500 INTERNAL_ERROR になっていた（実 API 実測で 25 経路）。
 *
 * 実 HTTP（Cookie 認証つき）で次を固定する。
 * 1. 要求版が名指す 4 エンドポイント（carriers / suppliers / warehouses / categories）の作成で
 *    `status: null` は 400 VALIDATION_ERROR。未指定は既定値 ACTIVE、有効値は指定どおり 201。
 * 2. 横断で洗い出した同型の残件（書き込み DTO の非 null 列）も 400 VALIDATION_ERROR（500 にしない）。
 * 3. nullable 列の `null` は従来どおり受け付ける（値のクリア）。
 * 4. 未指定（undefined）は従来どおり（作成は既定値・更新は変更しない）で通る。
 *
 * 前提: seed 済み DB。テスト専用の接頭辞で行を作り afterAll で消す。
 */
describe('書き込み API の null ガード (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  // 掲示板の書き込みは SYS_ADMIN のみ（announcements.controller.ts の @RequireRole）。
  let adminToken: string;

  const CODE_PREFIX = 'E2E-NULL-';
  let seq = 0;
  const nextCode = () => `${CODE_PREFIX}${++seq}`;

  // この spec が作った伝票（後始末で状態を問わず消す）
  const createdDocs = newCreatedDocumentIds();
  // この spec が作ったマスタ（後始末で id で消す。接頭辞で消すと同時に走った他の回の行まで消える）
  const createdMasters = {
    supplierIds: [] as number[],
    warehouseIds: [] as number[],
    categoryIds: [] as number[],
  };
  // 試験前の在庫（後始末で控えた値へ戻す）
  let stockBeforeRun: StockSnapshot;
  let adminUserId: string;

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(path).set('Cookie', authCookie(token)).send(body);
  const put = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).put(path).set('Cookie', authCookie(token)).send(body);
  const postAdmin = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(path).set('Cookie', authCookie(adminToken)).send(body);
  const putAdmin = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).put(path).set('Cookie', authCookie(adminToken)).send(body);

  const expectValidationError = (res: request.Response, field: string) => {
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details?.validationErrors ?? [])).toContain(field);
  };

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);
    stockBeforeRun = await snapshotStocks(prisma);
    adminUserId = (await prisma.user.findFirst({ where: { role: 'SYS_ADMIN' } }))!.id;
    token = await issueToken(app, SEED_EMAILS.whAdmin);
    adminToken = await issueToken(app, SEED_EMAILS.admin);
  });

  afterAll(async () => {
    await runE2ECleanup(app, async () => {
      await cleanupCreatedDocuments(prisma, createdDocs);
      // id で消しきれなかった行の取りこぼしを、接頭辞で掃除する（二段構え）。
      // 接頭辞だけに頼ると同時に走った別の回の行まで消え、id だけに頼ると採番が残って
      // 次の実行が 409 で落ちる（実測）。両方そろえて初めて「残らない・他人を消さない」になる。
      await deleteCreatedMasters(prisma, createdMasters);
      await restoreStocks(prisma, stockBeforeRun, adminUserId);
      await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-null-' } } });
      await prisma.product.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.carrier.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.supplier.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.category.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.warehouse.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
    });
  });

  // ============================================================
  // 1. 要求版が名指す 4 エンドポイントの作成（v2-456 の受入条件）
  // ============================================================
  describe('マスタ作成の status: null（要求版が名指す4経路）', () => {
    const modules = [
      { path: '/api/v1/carriers', count: () => prisma.carrier.count() },
      {
        path: '/api/v1/suppliers',
        count: () => prisma.supplier.count(),
        record: (id: number) => createdMasters.supplierIds.push(id),
      },
      {
        path: '/api/v1/warehouses',
        count: () => prisma.warehouse.count(),
        record: (id: number) => createdMasters.warehouseIds.push(id),
      },
      {
        path: '/api/v1/categories',
        count: () => prisma.category.count(),
        record: (id: number) => createdMasters.categoryIds.push(id),
      },
    ];

    for (const m of modules) {
      it(`${m.path} に status: null は 400 VALIDATION_ERROR（500 にしない・行は作らない）`, async () => {
        const before = await m.count();
        const code = nextCode();

        const res = await post(m.path, { code, name: 'e2e null', status: null });

        expectValidationError(res, 'status');
        expect(await m.count()).toBe(before);
      });

      it(`${m.path} の status 未指定は既定値 ACTIVE で 201（従来どおり）`, async () => {
        const res = await post(m.path, { code: nextCode(), name: 'e2e omitted' });

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('ACTIVE');
        m.record?.(res.body.data.id);
      });

      it(`${m.path} の有効な status（INACTIVE）は指定どおり 201`, async () => {
        const res = await post(m.path, {
          code: nextCode(),
          name: 'e2e inactive',
          status: 'INACTIVE',
        });

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('INACTIVE');
        m.record?.(res.body.data.id);
      });
    }
  });

  // ============================================================
  // 2. 横断で洗い出した同型の残件（作成・更新の非 null 列）
  // ============================================================
  describe('横断の残件: 作成で null は 400', () => {
    it('POST /api/v1/products の status / stockQuantity / price の null は 400', async () => {
      const base = { code: nextCode(), name: 'e2e product', categoryId: 1, price: 100 };
      const before = await prisma.product.count();

      for (const field of ['status', 'stockQuantity', 'price'] as const) {
        expectValidationError(await post('/api/v1/products', { ...base, [field]: null }), field);
      }

      expect(await prisma.product.count()).toBe(before);
    });

    it('POST /api/v1/announcements の isNew: null は 400', async () => {
      const res = await postAdmin('/api/v1/announcements', {
        title: 'e2e null isNew',
        bodyMarkdown: 'x',
        isNew: null,
        roleGroupIds: [],
      });

      expectValidationError(res, 'isNew');
    });
  });

  describe('横断の残件: 更新で null は 400（500 にしない）', () => {
    let productId: string;
    let carrierId: number;
    let userId: string;
    let announcementId: number;

    beforeAll(async () => {
      const product = await post('/api/v1/products', {
        code: nextCode(),
        name: 'e2e upd product',
        categoryId: 1,
        price: 100,
      });
      expect(product.status).toBe(201);
      productId = product.body.data.id;

      const carrier = await post('/api/v1/carriers', { code: nextCode(), name: 'e2e upd carrier' });
      expect(carrier.status).toBe(201);
      carrierId = carrier.body.data.id;

      const user = await post('/api/v1/users', {
        name: 'e2e null user',
        email: `e2e-null-${Date.now()}@test.example.com`,
      });
      expect(user.status).toBe(201);
      userId = user.body.data.id;

      const announcement = await postAdmin('/api/v1/announcements', {
        title: 'e2e null ann',
        bodyMarkdown: 'x',
        roleGroupIds: [],
      });
      expect(announcement.status).toBe(201);
      announcementId = announcement.body.data.id;
    });

    it('PUT /api/v1/products/:id の null（status / name / code / categoryId / price / stockQuantity）は 400', async () => {
      for (const field of [
        'status',
        'name',
        'code',
        'categoryId',
        'price',
        'stockQuantity',
      ] as const) {
        expectValidationError(await put(`/api/v1/products/${productId}`, { [field]: null }), field);
      }
    });

    it('PUT /api/v1/carriers/:id の null（status / name / code）は 400', async () => {
      for (const field of ['status', 'name', 'code'] as const) {
        expectValidationError(await put(`/api/v1/carriers/${carrierId}`, { [field]: null }), field);
      }
    });

    it('PUT /api/v1/users/:id の null（name / email / status / allowOidcLink）は 400', async () => {
      for (const field of ['name', 'email', 'status', 'allowOidcLink'] as const) {
        expectValidationError(await put(`/api/v1/users/${userId}`, { [field]: null }), field);
      }
    });

    it('PUT /api/v1/announcements/:id の null（title / isNew / isImportant / roleGroupIds）は 400', async () => {
      for (const field of ['title', 'isNew', 'isImportant', 'roleGroupIds'] as const) {
        expectValidationError(
          await putAdmin(`/api/v1/announcements/${announcementId}`, { [field]: null }),
          field,
        );
      }
    });

    it('PUT /api/v1/announcements/:id の roleGroupIds: null は 400（従来は素通りして無視されていた）', async () => {
      // v2-456: 以前は PartialType の @IsOptional が null を素通りさせ、repository の
      // `if (!roleGroupIds)` が「宛先を変更しない」として黙って無視していた（200）。
      // 未指定（変更しない）は従来どおり通ることを併せて固定する。
      const nullResult = await putAdmin(`/api/v1/announcements/${announcementId}`, {
        roleGroupIds: null,
      });
      expectValidationError(nullResult, 'roleGroupIds');

      const omitted = await putAdmin(`/api/v1/announcements/${announcementId}`, {
        title: 'e2e null ann（宛先は未指定のまま）',
      });
      expect(omitted.status).toBe(200);
      expect(omitted.body.data.title).toBe('e2e null ann（宛先は未指定のまま）');
    });

    it('PUT /api/v1/list-pagination-settings/:tableId の null は 400', async () => {
      // 一覧のページサイズ設定は SYS_ADMIN のみ（@RequireRole）。
      for (const field of ['defaultPageSize', 'pageSizeOptions'] as const) {
        expectValidationError(
          await putAdmin('/api/v1/list-pagination-settings/products', { [field]: null }),
          field,
        );
      }
    });

    it('DRAFT の入荷・出荷・棚卸・発注の更新で非 null 列の null は 400', async () => {
      const product = await prisma.product.findFirst({
        where: { code: { startsWith: CODE_PREFIX } },
      });
      const warehouse = await prisma.warehouse.findFirst();
      const supplier = await prisma.supplier.findFirst();

      const receiving = await post('/api/v1/receivings', {
        receivingDate: '2026-10-11',
        warehouseId: warehouse!.id,
        supplierId: supplier!.id,
        lines: [{ lineNo: 1, productId: product!.id, plannedQty: 1 }],
      });
      expect(receiving.status).toBe(201);
      createdDocs.receivingIds.push(receiving.body.data.id);
      expectValidationError(
        await put(`/api/v1/receivings/${receiving.body.data.id}`, { warehouseId: null }),
        'warehouseId',
      );
      expectValidationError(
        await put(`/api/v1/receivings/${receiving.body.data.id}`, { supplierId: null }),
        'supplierId',
      );

      const shipment = await post('/api/v1/shipments', {
        shipmentDate: '2026-10-11',
        warehouseId: warehouse!.id,
        destination: 'e2e',
        lines: [{ lineNo: 1, productId: product!.id, plannedQty: 1 }],
      });
      expect(shipment.status).toBe(201);
      createdDocs.shipmentIds.push(shipment.body.data.id);
      for (const field of ['warehouseId', 'destination', 'carrierId'] as const) {
        expectValidationError(
          await put(`/api/v1/shipments/${shipment.body.data.id}`, { [field]: null }),
          field,
        );
      }

      const stocktaking = await post('/api/v1/stocktakings', {
        stocktakingDate: '2026-10-11',
        warehouseId: warehouse!.id,
        items: [{ productId: product!.id, theoreticalQty: 1 }],
      });
      expect(stocktaking.status).toBe(201);
      createdDocs.stocktakingIds.push(stocktaking.body.data.id);
      expectValidationError(
        await put(`/api/v1/stocktakings/${stocktaking.body.data.id}`, { warehouseId: null }),
        'warehouseId',
      );

      const order = await post('/api/v1/orders', {
        orderDate: '2026-10-11',
        supplierId: supplier!.id,
        items: [{ lineNo: 1, productId: product!.id, orderQty: 1, unitPrice: 100 }],
      });
      expect(order.status).toBe(201);
      createdDocs.orderIds.push(order.body.data.id);
      expectValidationError(
        await put(`/api/v1/orders/${order.body.data.id}`, { supplierId: null }),
        'supplierId',
      );

      // 後始末は afterAll に置く（途中の expect がこけても、作った行を残さない）
    });

    it('更新で有効な値・未指定は従来どおり通る（回帰）', async () => {
      const renamed = await put(`/api/v1/carriers/${carrierId}`, { name: 'e2e renamed' });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data.name).toBe('e2e renamed');
      expect(renamed.body.data.status).toBe('ACTIVE');

      const statusChanged = await put(`/api/v1/carriers/${carrierId}`, { status: 'INACTIVE' });
      expect(statusChanged.status).toBe(200);
      expect(statusChanged.body.data.status).toBe('INACTIVE');
    });

    it('全項目を null にした本文も 400（1つでも非 null 列があれば通さない）', async () => {
      const res = await put(`/api/v1/carriers/${carrierId}`, {
        code: null,
        name: null,
        status: null,
      });

      expectValidationError(res, 'code');
      expect(JSON.stringify(res.body.error.details?.validationErrors ?? [])).toContain('status');
      const row = await prisma.carrier.findUnique({ where: { id: carrierId } });
      expect(row?.code).toMatch(/^E2E-NULL-/);
    });
  });

  // ============================================================
  // 3. nullable 列の null は従来どおり受け付ける（値のクリア）
  // ============================================================
  describe('nullable 列の null は受け付ける（クリア）', () => {
    it('carrier の address: null は作成・更新とも通る', async () => {
      const created = await post('/api/v1/carriers', {
        code: nextCode(),
        name: 'e2e nullable',
        address: null,
      });
      expect(created.status).toBe(201);
      expect(created.body.data.address).toBeNull();

      const updated = await put(`/api/v1/carriers/${created.body.data.id}`, { address: null });
      expect(updated.status).toBe(200);
      expect(updated.body.data.address).toBeNull();
    });

    it('product の purchasePrice: null は作成・更新とも通り、500 にならない', async () => {
      const created = await post('/api/v1/products', {
        code: nextCode(),
        name: 'e2e nullable price',
        categoryId: 1,
        price: 100,
        purchasePrice: null,
      });
      expect(created.status).toBe(201);
      expect(created.body.data.purchasePrice).toBeNull();

      const updated = await put(`/api/v1/products/${created.body.data.id}`, {
        purchasePrice: null,
      });
      expect(updated.status).toBe(200);
      expect(updated.body.data.purchasePrice).toBeNull();
    });

    it('announcement の notifiedAt: null は既定値へ落ちて 201（500 にしない）', async () => {
      const res = await postAdmin('/api/v1/announcements', {
        title: 'e2e nullable notifiedAt',
        bodyMarkdown: 'x',
        notifiedAt: null,
        roleGroupIds: [],
      });

      expect(res.status).toBe(201);
      expect(res.body.data.notifiedAt).toBeTruthy();
    });
  });
});
