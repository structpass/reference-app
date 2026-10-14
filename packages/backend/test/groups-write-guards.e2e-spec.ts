import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createE2EApp, issueToken, authCookie, SEED_EMAILS } from './helpers/auth.helper';

/**
 * v2-428 / v2-445: グループの作成・更新・削除で、閉じられるはずの入力と状態が 500 になる、の回帰テスト。
 *
 * 実 API（Cookie 認証つき HTTP）で次を固定する。
 * 1. `POST /api/v1/groups` の `status: null` は 400（VALIDATION_ERROR）で閉じる。DB の非 null 列へ
 *    `null` を届かせない（以前は Prisma の `Argument ... must not be null` で 500 INTERNAL_ERROR に
 *    なっていた。v2-445）。未指定は既定値（ACTIVE）、nullable 列の `description: null` は受け付ける。
 * 2. `PUT /api/v1/groups/:id` の `null` は 400（VALIDATION_ERROR）で閉じる。DB の非 null 列
 *    （code / name / role / status）へ `null` を届かせない（以前は Prisma の
 *    `Argument ... must not be null` で 500 INTERNAL_ERROR になっていた）。nullable 列の
 *    `description` は `null` を受け付け、未指定（undefined）は従来どおり「変更しない」。
 * 3. 同じグループへの同時 DELETE は 500 を返さない。片方が 200、もう片方が 404
 *    （逐次で再送した時と同じ 'Group not found'）になり、どちらの順でも結果が同じになる。
 * 4. 依存データ（所属ユーザー）が残るグループの削除は従来どおり 409 で拒否される。
 * 5. `PUT /api/v1/groups/:id` の「行が無い」応答は文言まで逐次と揃う（`404 NOT_FOUND` の
 *    `Group not found`。v2-446）。code 重複の 409 と通常の更新は変えない。
 *
 * 前提: seed 済み DB（`pnpm prisma db seed`）。テスト専用グループを作って afterAll で消す。
 */
describe('グループ作成・更新・削除の入力検証と同時削除 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const token = {} as Record<string, string>;
  const CODE_PREFIX = 'E2E-GUARD-';
  let seq = 0;

  const nextCode = () => `${CODE_PREFIX}${++seq}`;

  const createGroup = (code: string, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', authCookie(token.whAdmin))
      .send({ code, name: 'v2-428 e2e', role: 'WH_USER', ...extra });

  const updateGroup = (groupId: number, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put(`/api/v1/groups/${groupId}`)
      .set('Cookie', authCookie(token.whAdmin))
      .send(body);

  const deleteGroup = (groupId: number) =>
    request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}`)
      .set('Cookie', authCookie(token.whAdmin));

  const groupRow = (groupId: number) => prisma.group.findUnique({ where: { id: groupId } });

  /** 使い捨てグループを1つ作る（後始末は afterAll が接頭辞でまとめて行う）。 */
  const makeScratchGroup = async (extra: Record<string, unknown> = {}) => {
    const res = await createGroup(nextCode(), extra);
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);

    token.whAdmin = await issueToken(app, SEED_EMAILS.whAdmin);
    token.ofUser = await issueToken(app, SEED_EMAILS.ofUser);

    await prisma.group.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
  });

  afterAll(async () => {
    await prisma.userGroup.deleteMany({
      where: { group: { code: { startsWith: CODE_PREFIX } } },
    });
    await prisma.group.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
    await app.close();
  });

  // ============================================================
  // 1. POST の null (v2-445): 作成でも入れられない値は入力の型で 400 に閉じる
  // ============================================================
  describe('POST /api/v1/groups の null', () => {
    it('status: null は 400 VALIDATION_ERROR（500 にしない・行は作らない）', async () => {
      const code = nextCode();

      const res = await createGroup(code, { status: null });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details?.validationErrors ?? [])).toContain('status');
      expect(await prisma.group.count({ where: { code } })).toBe(0);
    });

    it('status 未指定は既定値 ACTIVE で 201（従来どおり）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', authCookie(token.whAdmin))
        .send({ code: nextCode(), name: 'v2-445 e2e', role: 'WH_USER' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('有効な status（INACTIVE）は指定どおり 201', async () => {
      const res = await createGroup(nextCode(), { status: 'INACTIVE' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('INACTIVE');
    });

    it('description: null は 201（nullable 列）', async () => {
      const res = await createGroup(nextCode(), { description: null });

      expect(res.status).toBe(201);
      expect(res.body.data.description).toBeNull();
    });
  });

  // ============================================================
  // 2. PUT の null: 入れられない値は入力の型で 400 に閉じる
  // ============================================================
  describe('PUT /api/v1/groups/:id の null', () => {
    for (const field of ['role', 'name', 'code', 'status']) {
      it(`${field}: null は 400 VALIDATION_ERROR（500 にしない・行は変わらない）`, async () => {
        const groupId = await makeScratchGroup();
        const before = await groupRow(groupId);

        const res = await updateGroup(groupId, { [field]: null });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(JSON.stringify(res.body.error.details?.validationErrors ?? [])).toContain(field);
        expect(await groupRow(groupId)).toEqual(before);
      });
    }

    it('description: null は受け付ける（nullable 列・説明のクリア）', async () => {
      const groupId = await makeScratchGroup({ description: '消す説明' });

      const res = await updateGroup(groupId, { description: null });

      expect(res.status).toBe(200);
      expect((await groupRow(groupId))?.description).toBeNull();
    });

    it('未指定（undefined）は従来どおり「変更しない」で通る', async () => {
      const groupId = await makeScratchGroup();

      const res = await updateGroup(groupId, { name: 'v2-428 改名' });

      expect(res.status).toBe(200);
      const row = await groupRow(groupId);
      expect(row?.name).toBe('v2-428 改名');
      expect(row?.role).toBe('WH_USER');
      expect(row?.status).toBe('ACTIVE');
    });

    it('存在しないグループは従来どおり 404', async () => {
      const res = await updateGroup(99999999, { name: 'x' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    // v2-446: 「行が無い」時の文言を経路で分けない。Prisma の P2025 をグローバルフィルタへ委ねると
    // `対象のレコードが見つかりません` になり、逐次の `Group not found` と揃わなくなる。
    it('存在しないグループの 404 は Group not found（文言も逐次と揃う）', async () => {
      const res = await updateGroup(99999999, { name: 'x' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Group not found');
    });

    it('code 重複の更新は 409 CONFLICT のまま', async () => {
      const first = await makeScratchGroup();
      const other = await createGroup(nextCode(), { name: 'v2-446 重複先' });
      expect(other.status).toBe(201);
      const otherCode = other.body.data.code as string;

      const res = await updateGroup(first, { code: otherCode });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  // ============================================================
  // 3. 同時 DELETE: 500 を返さず、200 と 404 の組になる
  // ============================================================
  describe('DELETE /api/v1/groups/:id の同時実行', () => {
    for (const round of [1, 2, 3]) {
      it(`同じグループへ 2 本同時（${round} 回目）: 200 と 404 になり、500 を返さない`, async () => {
        const groupId = await makeScratchGroup();

        const [first, second] = await Promise.all([deleteGroup(groupId), deleteGroup(groupId)]);
        const statuses = [first.status, second.status].sort((a, b) => a - b);

        expect(statuses).toEqual([200, 404]);
        const loser = first.status === 404 ? first : second;
        expect(loser.body.error.code).toBe('NOT_FOUND');
        expect(loser.body.error.message).toBe('Group not found');
        expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
      });
    }

    it('削除済みへの再送（3 本目）も同じ 404 になる', async () => {
      const groupId = await makeScratchGroup();

      const [first, second] = await Promise.all([deleteGroup(groupId), deleteGroup(groupId)]);
      const winner = first.status === 200 ? first : second;
      expect(winner.status).toBe(200);

      const third = await deleteGroup(groupId);

      expect(third.status).toBe(404);
      expect(third.body.error.code).toBe('NOT_FOUND');
      expect(third.body.error.message).toBe('Group not found');
    });

    it('存在しないグループの削除も同じ 404（逐次と同時で応答が揃う）', async () => {
      const res = await deleteGroup(99999999);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Group not found');
    });
  });

  // ============================================================
  // 4. 依存データが残るグループの削除は従来どおり拒否する
  // ============================================================
  describe('DELETE の依存検査（v2-412 の維持）', () => {
    it('所属ユーザーが残るグループは 409 で削除せず、所属を外せば削除できる', async () => {
      const groupId = await makeScratchGroup();
      const user = await prisma.user.findUniqueOrThrow({ where: { email: SEED_EMAILS.ofUser } });
      await prisma.userGroup.create({ data: { groupId, userId: user.id } });

      const denied = await deleteGroup(groupId);

      expect(denied.status).toBe(409);
      expect(denied.body.error.message).toContain('所属ユーザー');
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(1);

      await prisma.userGroup.deleteMany({ where: { groupId } });

      const allowed = await deleteGroup(groupId);

      expect(allowed.status).toBe(200);
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
    });
  });
});
