import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import {
  createE2EApp,
  issueToken,
  authCookie,
  resolveSeedAccount,
  SEED_EMAILS,
  SeedAccountKey,
} from './helpers/auth.helper';

/**
 * v2-412: グループ所属の自己追加で掲示の公開範囲を回避できる、の回帰テスト。
 * v2-425: 管理を委ねられていないグループへの第三者追加を塞いだ、の可否マトリクスを足した。
 *
 * 実 API（Cookie 認証つき HTTP）で次を固定する。
 * 1. members 変更の可否マトリクス（呼び出し元ロール × 宛先グループのロール系統 × 操作 × 対象）。
 *    一般ユーザーは groups:update を持たず 403、管理者は「自分自身の追加」「SYS_ADMIN 領域」
 *    「担当系統の違うグループ」を拒否される。同じ系統の管理者による編成は通る（既存運用の維持）。
 * 2. 掲示の可視性: 可視でない掲示と存在しない掲示の応答が揃う（status と error code）。
 * 3. 攻撃経路の結合: 自分を宛先グループへ追加できないため、本来読めない宛先の掲示は
 *    本文も添付も取得できないままになる。
 *
 * 前提: seed 済み DB（`pnpm prisma db seed`）。テスト専用グループと添付行を作って afterAll で消す。
 */
describe('グループ所属の変更スコープと掲示の可視性 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const token = {} as Record<string, string>;
  const userId = {} as Record<string, string>;

  let scratchGroupId: number;
  let scratchOfGroupId: number;
  let sysOnlyGroupId: number;
  let whGroupId: number;
  let ofGroupId: number;
  let whAnnouncementId: number;
  let ofAnnouncementId: number;
  let attachmentId: number;

  const SCRATCH_CODE = 'E2E-SCOPE-WH';
  const SCRATCH_OF_CODE = 'E2E-SCOPE-OF';
  const SYS_ONLY_CODE = 'E2E-SCOPE-SYS';
  const NEW_GROUP_CODE = 'E2E-SCOPE-NEW';
  const SCRATCH_ANNOUNCEMENT_TITLE = 'E2E-SCOPE-VISIBILITY';

  const add = (groupId: number, tokenValue: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/groups/${groupId}/members`)
      .set('Cookie', authCookie(tokenValue))
      .send(body);

  const remove = (groupId: number, targetUserId: string, tokenValue: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}/members/${targetUserId}`)
      .set('Cookie', authCookie(tokenValue));

  const createGroup = (tokenValue: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', authCookie(tokenValue))
      .send(body);

  const updateGroup = (groupId: number, tokenValue: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put(`/api/v1/groups/${groupId}`)
      .set('Cookie', authCookie(tokenValue))
      .send(body);

  const deleteGroup = (groupId: number, tokenValue: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}`)
      .set('Cookie', authCookie(tokenValue));

  const getAnnouncement = (announcementId: number, tokenValue: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/announcements/${announcementId}`)
      .set('Cookie', authCookie(tokenValue));

  const groupRole = async (groupId: number) =>
    (await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).role;

  const membershipCount = (groupId: number, targetUserId: string) =>
    prisma.userGroup.count({ where: { groupId, userId: targetUserId } });

  /** 所属行を冪等に用意する（テスト間で状態を持ち越さない）。 */
  const ensureMember = (groupId: number, targetUserId: string) =>
    prisma.userGroup.upsert({
      where: { userId_groupId: { userId: targetUserId, groupId } },
      update: {},
      create: { userId: targetUserId, groupId },
    });

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);

    token.sysAdmin = await issueToken(app, SEED_EMAILS.admin);
    token.whUser = await issueToken(app, SEED_EMAILS.whUser);
    token.whAdmin = await issueToken(app, SEED_EMAILS.whAdmin);
    token.ofUser = await issueToken(app, SEED_EMAILS.ofUser);
    token.ofAdmin = await issueToken(app, SEED_EMAILS.ofAdmin);

    for (const key of Object.keys(SEED_EMAILS) as SeedAccountKey[]) {
      // 引き当ては oidcSub（email は JIT で IdP の値へ更新されるため使わない）。
      userId[key] = (await resolveSeedAccount(app, key)).id;
    }

    // 検証専用のグループ（role=WH_USER / role=OF_USER / role=SYS_ADMIN）。seed の 20 グループは
    // 既定 role=WH_USER のため、系統と SYS_ADMIN 領域の検査には明示的に role を持つ行が要る。
    await prisma.group.deleteMany({
      where: { code: { in: [SCRATCH_CODE, SCRATCH_OF_CODE, SYS_ONLY_CODE, NEW_GROUP_CODE] } },
    });
    scratchGroupId = (
      await prisma.group.create({
        data: { code: SCRATCH_CODE, name: 'E2E スコープ検証', role: 'WH_USER' },
      })
    ).id;
    scratchOfGroupId = (
      await prisma.group.create({
        data: { code: SCRATCH_OF_CODE, name: 'E2E スコープ検証（事務）', role: 'OF_USER' },
      })
    ).id;
    sysOnlyGroupId = (
      await prisma.group.create({
        data: { code: SYS_ONLY_CODE, name: 'E2E システム管理者域', role: 'SYS_ADMIN' },
      })
    ).id;

    whGroupId = (await prisma.group.findUniqueOrThrow({ where: { code: 'GRP-WH' } })).id;
    ofGroupId = (await prisma.group.findUniqueOrThrow({ where: { code: 'GRP-OF' } })).id;

    // 変更前の実装では攻撃経路のテストが実際に所属を作ってしまうため、開始時と終了時に
    // seed の所属状態（倉庫管理者は GRP-WH のみ・事務管理者は GRP-OF のみ）へ戻す。
    await prisma.userGroup.deleteMany({
      where: {
        userId: userId.ofAdmin,
        groupId: { in: [whGroupId, scratchGroupId, sysOnlyGroupId] },
      },
    });

    // 倉庫チーム宛て（GRP-WH）だけに公開された掲示と、事務チーム宛て（GRP-OF）だけの掲示。
    whAnnouncementId = (
      await prisma.announcement.findFirstOrThrow({
        where: {
          roles: { some: { group: { code: 'GRP-WH' } } },
          AND: [{ roles: { none: { group: { code: 'GRP-OF' } } } }],
        },
        orderBy: { id: 'asc' },
      })
    ).id;
    ofAnnouncementId = (
      await prisma.announcement.findFirstOrThrow({
        where: {
          roles: { some: { group: { code: 'GRP-OF' } } },
        },
        orderBy: { id: 'asc' },
      })
    ).id;

    // ダウンロード経路の可視性判定を通すため、倉庫宛て掲示へ添付行を1件だけ足す。
    // 実ファイルは置かない（拒否はストリーム開始より前に決まることを確かめる）。
    attachmentId = (
      await prisma.announcementAttachment.create({
        data: {
          announcementId: whAnnouncementId,
          fileName: 'e2e-scope.pdf',
          storagePath: 'e2e-scope/not-a-real-file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          sortOrder: 0,
          createdById: userId.sysAdmin,
        },
      })
    ).id;
  });

  afterAll(async () => {
    // 検証で作った所属・グループ・添付を消して seed 状態へ戻す（変更前の実装で走らせた時も
    // 攻撃経路のテストが作った所属を残さない）。
    await prisma.userGroup.deleteMany({
      where: { groupId: { in: [scratchGroupId, scratchOfGroupId, sysOnlyGroupId] } },
    });
    await prisma.userGroup.deleteMany({ where: { userId: userId.ofAdmin, groupId: whGroupId } });
    await prisma.announcementAttachment.deleteMany({ where: { id: attachmentId } });
    await prisma.announcement.deleteMany({ where: { title: SCRATCH_ANNOUNCEMENT_TITLE } });
    await prisma.group.deleteMany({
      where: { code: { in: [SCRATCH_CODE, SCRATCH_OF_CODE, SYS_ONLY_CODE, NEW_GROUP_CODE] } },
    });
    await app.close();
  });

  // ============================================================
  // 1. members 変更の可否マトリクス（呼び出し元ロール × 操作）
  // ============================================================
  describe('members 変更の可否（呼び出し元ロール別）', () => {
    it('WH_USER は groups:update を持たず、他人の追加は 403', async () => {
      const res = await add(scratchGroupId, token.whUser, { userId: userId.ofUser });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.ofUser)).toBe(0);
    });

    it('OF_USER も groups:update を持たず、他人の追加は 403', async () => {
      const res = await add(scratchGroupId, token.ofUser, { userId: userId.whUser });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.whUser)).toBe(0);
    });

    it('WH_ADMIN は自分自身を追加できない（403・所属は増えない）', async () => {
      const res = await add(scratchGroupId, token.whAdmin, { userId: userId.whAdmin });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.whAdmin)).toBe(0);
    });

    it('OF_ADMIN も自分自身を追加できない（403・所属は増えない）', async () => {
      const res = await add(scratchOfGroupId, token.ofAdmin, { userId: userId.ofAdmin });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchOfGroupId, userId.ofAdmin)).toBe(0);
    });

    it('WH_ADMIN は同じ系統の他人を追加できる（201・既存運用の維持）', async () => {
      const res = await add(scratchGroupId, token.whAdmin, { userId: userId.ofUser });
      expect(res.status).toBe(201);
      expect(await membershipCount(scratchGroupId, userId.ofUser)).toBe(1);
      await remove(scratchGroupId, userId.ofUser, token.whAdmin).expect(200);
    });

    it('OF_ADMIN は同じ系統の他人を追加できる（201・既存運用の維持）', async () => {
      const res = await add(scratchOfGroupId, token.ofAdmin, { userId: userId.ofUser });
      expect(res.status).toBe(201);
      expect(await membershipCount(scratchOfGroupId, userId.ofUser)).toBe(1);
      await remove(scratchOfGroupId, userId.ofUser, token.ofAdmin).expect(200);
    });

    it('WH_ADMIN は SYS_ADMIN ロールのユーザーを追加できない（403）', async () => {
      const res = await add(scratchGroupId, token.whAdmin, { userId: userId.admin });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.admin)).toBe(0);
    });

    it('WH_ADMIN は role=SYS_ADMIN のグループへは追加できない（403）', async () => {
      const res = await add(sysOnlyGroupId, token.whAdmin, { userId: userId.ofUser });
      expect(res.status).toBe(403);
      expect(await membershipCount(sysOnlyGroupId, userId.ofUser)).toBe(0);
    });

    it('SYS_ADMIN は role=SYS_ADMIN のグループへ追加できる（201）', async () => {
      const res = await add(sysOnlyGroupId, token.sysAdmin, { userId: userId.whUser });
      expect(res.status).toBe(201);
      expect(await membershipCount(sysOnlyGroupId, userId.whUser)).toBe(1);
    });

    it('SYS_ADMIN は自分自身を追加できる（201・全機能バイパスの維持）', async () => {
      const res = await add(sysOnlyGroupId, token.sysAdmin, { userId: userId.admin });
      expect(res.status).toBe(201);
      expect(await membershipCount(sysOnlyGroupId, userId.admin)).toBe(1);
    });

    it('WH_ADMIN は SYS_ADMIN ユーザーを削除できない（403・所属は残る）', async () => {
      await ensureMember(scratchGroupId, userId.admin);
      const res = await remove(scratchGroupId, userId.admin, token.whAdmin);
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.admin)).toBe(1);
    });

    it('自分自身の削除は禁止しない（200・可視範囲は狭まるだけで昇格にならない）', async () => {
      await ensureMember(scratchGroupId, userId.whAdmin);
      const res = await remove(scratchGroupId, userId.whAdmin, token.whAdmin);
      expect(res.status).toBe(200);
      expect(await membershipCount(scratchGroupId, userId.whAdmin)).toBe(0);
    });

    it('SYS_ADMIN は SYS_ADMIN ユーザーの削除もできる（200）', async () => {
      await ensureMember(scratchGroupId, userId.admin);
      const res = await remove(scratchGroupId, userId.admin, token.sysAdmin);
      expect(res.status).toBe(200);
      expect(await membershipCount(scratchGroupId, userId.admin)).toBe(0);
    });
  });

  // ============================================================
  // 1b. 編成の範囲（グループのロール系統 × 呼び出し元）— v2-425
  // ============================================================
  describe('編成の範囲（管理を委ねられていないグループへの追加）', () => {
    it('OF_ADMIN は WH 系統のグループへ第三者を追加できない（403・所属は増えない）', async () => {
      const res = await add(scratchGroupId, token.ofAdmin, { userId: userId.ofUser });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.ofUser)).toBe(0);
      expect(res.body.error.message).toContain('システム管理者');
    });

    it('WH_ADMIN は OF 系統のグループへ第三者を追加できない（403・所属は増えない）', async () => {
      const res = await add(scratchOfGroupId, token.whAdmin, { userId: userId.whUser });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchOfGroupId, userId.whUser)).toBe(0);
    });

    it('管理者どうしの相互追加が塞がる（OF_ADMIN は WH_ADMIN を WH 系統へ足せない）', async () => {
      const res = await add(scratchGroupId, token.ofAdmin, { userId: userId.whAdmin });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.whAdmin)).toBe(0);
    });

    it('管理者どうしの相互追加が塞がる（WH_ADMIN は OF_ADMIN を OF 系統へ足せない）', async () => {
      const res = await add(scratchOfGroupId, token.whAdmin, { userId: userId.ofAdmin });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchOfGroupId, userId.ofAdmin)).toBe(0);
    });

    it('一般ユーザーは系統が一致していても追加できない（403・編成は管理者の役割）', async () => {
      const res = await add(scratchGroupId, token.whUser, { userId: userId.ofUser });
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.ofUser)).toBe(0);
    });

    it('OF_ADMIN は WH 系統のグループから削除できない（403・所属は残る）', async () => {
      await ensureMember(scratchGroupId, userId.ofUser);
      const res = await remove(scratchGroupId, userId.ofUser, token.ofAdmin);
      expect(res.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.ofUser)).toBe(1);
      await prisma.userGroup.deleteMany({ where: { groupId: scratchGroupId } });
    });

    it('SYS_ADMIN は系統を問わず編成できる（201・全機能バイパスの維持）', async () => {
      const res = await add(scratchOfGroupId, token.sysAdmin, { userId: userId.whUser });
      expect(res.status).toBe(201);
      expect(await membershipCount(scratchOfGroupId, userId.whUser)).toBe(1);
      await remove(scratchOfGroupId, userId.whUser, token.sysAdmin).expect(200);
    });

    it('受容した穴: 同じ系統の管理者どうしの追加は通る（編成の委任。ADR で受容と明記）', async () => {
      const res = await add(scratchGroupId, token.whAdmin, { userId: userId.whUser });
      expect(res.status).toBe(201);
      expect(await membershipCount(scratchGroupId, userId.whUser)).toBe(1);
      await remove(scratchGroupId, userId.whUser, token.whAdmin).expect(200);
    });
  });

  // ============================================================
  // 2. 掲示の可視性: 可視でない対象と存在しない対象の応答を揃える
  // ============================================================
  describe('掲示の可視性と存在秘匿', () => {
    it('可視の掲示は 200 で取得できる（事務管理者 × 事務宛て）', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/announcements/${ofAnnouncementId}`)
        .set('Cookie', authCookie(token.ofAdmin));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('可視でない掲示と存在しない掲示の応答が揃う（事務管理者 × 倉庫宛て）', async () => {
      const invisible = await request(app.getHttpServer())
        .get(`/api/v1/announcements/${whAnnouncementId}`)
        .set('Cookie', authCookie(token.ofAdmin));
      const missing = await request(app.getHttpServer())
        .get('/api/v1/announcements/99999999')
        .set('Cookie', authCookie(token.ofAdmin));

      expect(invisible.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(invisible.body.error.code).toBe(missing.body.error.code);
      expect(invisible.body.error.message).toBe(missing.body.error.message);
    });

    it('添付も同じく、可視でない掲示と存在しない掲示で応答が揃う（事務管理者 × 倉庫宛て添付）', async () => {
      const invisible = await request(app.getHttpServer())
        .get(`/api/v1/announcements/${whAnnouncementId}/attachments/${attachmentId}/download`)
        .set('Cookie', authCookie(token.ofAdmin));
      const missing = await request(app.getHttpServer())
        .get(`/api/v1/announcements/99999999/attachments/${attachmentId}/download`)
        .set('Cookie', authCookie(token.ofAdmin));

      expect(invisible.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(invisible.body.error.code).toBe(missing.body.error.code);
      expect(invisible.body.error.message).toBe(missing.body.error.message);
    });
  });

  // ============================================================
  // 3. 攻撃経路の結合: 自己追加 → 本来読めない宛先の掲示取得
  // ============================================================
  describe('自己追加による公開範囲の回避', () => {
    it('事務管理者は倉庫宛てグループへ自分を追加できず、倉庫宛て掲示の本文も添付も取れない', async () => {
      const before = await membershipCount(whGroupId, userId.ofAdmin);

      const addSelf = await add(whGroupId, token.ofAdmin, { userId: userId.ofAdmin });
      expect(addSelf.status).toBe(403);
      expect(await membershipCount(whGroupId, userId.ofAdmin)).toBe(before);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/announcements/${whAnnouncementId}`)
        .set('Cookie', authCookie(token.ofAdmin));
      expect(detail.status).toBe(404);

      const download = await request(app.getHttpServer())
        .get(`/api/v1/announcements/${whAnnouncementId}/attachments/${attachmentId}/download`)
        .set('Cookie', authCookie(token.ofAdmin));
      expect(download.status).toBe(404);
    });

    it('自分の id の表記を変えても所属は増えない（本文の文字列で自分と判定しない）', async () => {
      const body = { userId: userId.whAdmin.toUpperCase() };

      const res = await add(scratchGroupId, token.whAdmin, body);

      // 表記の違いはユーザー取得の完全一致で落ちる（403 まで進む実装・UUID 型へ正規化する実装の
      // どちらでも所属が増えないことが本質なので、status は拒否であることだけを見る）。
      expect([403, 404]).toContain(res.status);
      expect(await membershipCount(scratchGroupId, userId.whAdmin)).toBe(0);
    });

    it('UUID 形式でない userId は 400（入力の型で閉じる）', async () => {
      const res = await add(scratchGroupId, token.whAdmin, { userId: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================
  // 4. SYS_ADMIN 領域の前提（Group.role）を同じ権限で書き換えられないこと
  // ============================================================
  describe('SYS_ADMIN グループの role を書き換える経路', () => {
    it('WH_ADMIN は role=SYS_ADMIN のグループを変更できない（403・role は変わらない）', async () => {
      const res = await updateGroup(sysOnlyGroupId, token.whAdmin, { role: 'WH_USER' });

      expect(res.status).toBe(403);
      expect(await groupRole(sysOnlyGroupId)).toBe('SYS_ADMIN');
    });

    it('WH_ADMIN はグループの role を SYS_ADMIN へ変更できない（403）', async () => {
      const res = await updateGroup(scratchGroupId, token.whAdmin, { role: 'SYS_ADMIN' });

      expect(res.status).toBe(403);
      expect(await groupRole(scratchGroupId)).toBe('WH_USER');
    });

    it('WH_ADMIN は role=SYS_ADMIN のグループを削除できない（403）', async () => {
      const res = await deleteGroup(sysOnlyGroupId, token.whAdmin);

      expect(res.status).toBe(403);
      expect(await prisma.group.count({ where: { id: sysOnlyGroupId } })).toBe(1);
    });

    it('WH_ADMIN は role=SYS_ADMIN のグループを作成できない（403）', async () => {
      const res = await createGroup(token.whAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 作成拒否',
        role: 'SYS_ADMIN',
      });

      expect(res.status).toBe(403);
      expect(await prisma.group.count({ where: { code: NEW_GROUP_CODE } })).toBe(0);
    });

    /**
     * v2-425 / 独立レビュー F-4: 作成経路の系統偽装。更新経路を閉じても、作成で系統を選べると
     * 「作った本人が編成できないグループを相手系統の管理者が編成できる」状態が作れる。
     */
    it('WH_ADMIN は OF 系統のグループを作成できない（403・作られない）', async () => {
      const res = await createGroup(token.whAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 系統偽装',
        role: 'OF_USER',
      });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('システム管理者');
      expect(await prisma.group.count({ where: { code: NEW_GROUP_CODE } })).toBe(0);
    });

    it('OF_ADMIN は WH 系統のグループを作成できない（403・作られない）', async () => {
      const res = await createGroup(token.ofAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 系統偽装',
        role: 'WH_USER',
      });

      expect(res.status).toBe(403);
      expect(await prisma.group.count({ where: { code: NEW_GROUP_CODE } })).toBe(0);
    });

    it('系統偽装の攻撃が成立しない（作成 403 → 相手系統の管理者の追加も成立しない）', async () => {
      // 攻撃: ① WH_ADMIN が role=OF_USER のグループを作る → ② OF_ADMIN がそれへ第三者を追加する。
      const createAttempt = await createGroup(token.whAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 攻撃',
        role: 'OF_USER',
      });
      expect(createAttempt.status).toBe(403);

      // グループ自体が作られていないため、後続の追加は対象不在で落ちる（所属は増えない）。
      const group = await prisma.group.findUnique({ where: { code: NEW_GROUP_CODE } });
      expect(group).toBeNull();
      expect(await membershipCount(scratchOfGroupId, userId.ofUser)).toBe(0);
    });

    it('管理者は自分の系統のグループを作成でき、そのグループを編成できる（既存運用の維持）', async () => {
      const created = await createGroup(token.ofAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 事務系統',
        role: 'OF_USER',
      });
      expect(created.status).toBe(201);
      const createdId = created.body.data.id as number;

      const added = await add(createdId, token.ofAdmin, { userId: userId.ofUser });
      expect(added.status).toBe(201);
      expect(await membershipCount(createdId, userId.ofUser)).toBe(1);

      await prisma.userGroup.deleteMany({ where: { groupId: createdId } });
      const deleted = await deleteGroup(createdId, token.ofAdmin);
      expect(deleted.status).toBe(200);
    });

    it('SYS_ADMIN は系統を問わず作成できる（バイパス維持）', async () => {
      const created = await createGroup(token.sysAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 横断作成',
        role: 'OF_USER',
      });
      expect(created.status).toBe(201);

      const deleted = await deleteGroup(created.body.data.id as number, token.sysAdmin);
      expect(deleted.status).toBe(200);
    });

    it('作成したグループを相手系統の管理者は編成できない（帰属が崩れない）', async () => {
      const created = await createGroup(token.ofAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 帰属',
        role: 'OF_USER',
      });
      expect(created.status).toBe(201);
      const createdId = created.body.data.id as number;

      const crossAdd = await add(createdId, token.whAdmin, { userId: userId.whUser });
      expect(crossAdd.status).toBe(403);
      expect(await membershipCount(createdId, userId.whUser)).toBe(0);

      const deleted = await deleteGroup(createdId, token.ofAdmin);
      expect(deleted.status).toBe(200);
    });

    it('SYS_ADMIN は role=SYS_ADMIN のグループを作成・変更・削除できる（バイパス維持）', async () => {
      const created = await createGroup(token.sysAdmin, {
        code: NEW_GROUP_CODE,
        name: 'E2E 作成可',
        role: 'SYS_ADMIN',
      });
      expect(created.status).toBe(201);
      const createdId = created.body.data.id as number;

      const updated = await updateGroup(createdId, token.sysAdmin, { name: 'E2E 更新可' });
      expect(updated.status).toBe(200);

      const deleted = await deleteGroup(createdId, token.sysAdmin);
      expect(deleted.status).toBe(200);
      expect(await prisma.group.count({ where: { id: createdId } })).toBe(0);
    });

    /**
     * v2-425 / 独立レビュー F-1: 編成の境界は `Group.role` を根拠にするため、その role を
     * 編成の側が書き換えられると境界が成立しない。系統をまたぐ書き換えを塞いだことを、
     * 「書き換えてから越境追加する」という実際の攻撃の順で固定する。
     */
    it('OF_ADMIN は OF 系統のグループを WH 系統へ書き換えられない（403・role は変わらない）', async () => {
      const res = await updateGroup(scratchOfGroupId, token.ofAdmin, { role: 'WH_USER' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('システム管理者');
      expect(await groupRole(scratchOfGroupId)).toBe('OF_USER');
    });

    it('WH_ADMIN は WH 系統のグループを OF 系統へ書き換えられない（403・role は変わらない）', async () => {
      const res = await updateGroup(scratchGroupId, token.whAdmin, { role: 'OF_USER' });

      expect(res.status).toBe(403);
      expect(await groupRole(scratchGroupId)).toBe('WH_USER');
    });

    it('越境追加の攻撃が role の書き換えを挟んでも成立しない（403 → 403・所属は増えない）', async () => {
      // 攻撃: ① OF_ADMIN が OF 系統のグループを WH 系統へ書き換える → ② WH_ADMIN が第三者を追加する。
      const rewrite = await updateGroup(scratchOfGroupId, token.ofAdmin, { role: 'WH_USER' });
      expect(rewrite.status).toBe(403);

      const attack = await add(scratchOfGroupId, token.whAdmin, { userId: userId.whUser });
      expect(attack.status).toBe(403);
      expect(await membershipCount(scratchOfGroupId, userId.whUser)).toBe(0);
      expect(await groupRole(scratchOfGroupId)).toBe('OF_USER');
    });

    it('逆向きの攻撃（WH 系統を OF 系統へ書き換えてから OF_ADMIN が追加）も成立しない', async () => {
      const rewrite = await updateGroup(scratchGroupId, token.whAdmin, { role: 'OF_USER' });
      expect(rewrite.status).toBe(403);

      const attack = await add(scratchGroupId, token.ofAdmin, { userId: userId.ofUser });
      expect(attack.status).toBe(403);
      expect(await membershipCount(scratchGroupId, userId.ofUser)).toBe(0);
      expect(await groupRole(scratchGroupId)).toBe('WH_USER');
    });

    it('同じ系統の中での role の書き換えはできる（編成の範囲が変わらない）', async () => {
      const res = await updateGroup(scratchGroupId, token.whAdmin, { role: 'WH_ADMIN' });

      expect(res.status).toBe(200);
      expect(await groupRole(scratchGroupId)).toBe('WH_ADMIN');

      // 元へ戻す（後続のテストの前提を壊さない）。
      const restore = await updateGroup(scratchGroupId, token.whAdmin, { role: 'WH_USER' });
      expect(restore.status).toBe(200);
    });

    /**
     * v2-425 / 独立レビュー F-6: 編集は「そのグループを編成できる側」に閉じる。role の付け替え
     * だけを見ていると、系統をまたいで code や status を書き換えられる（実測で 200 だった）。
     */
    it('WH_ADMIN は OF 系統のグループの status を書き換えられない（403・変わらない）', async () => {
      const before = (await prisma.group.findUniqueOrThrow({ where: { id: scratchOfGroupId } }))
        .status;
      const res = await updateGroup(scratchOfGroupId, token.whAdmin, { status: 'INACTIVE' });

      expect(res.status).toBe(403);
      expect(
        (await prisma.group.findUniqueOrThrow({ where: { id: scratchOfGroupId } })).status,
      ).toBe(before);
    });

    it('WH_ADMIN は OF 系統のグループのコードを書き換えられない（403・変わらない）', async () => {
      const res = await updateGroup(scratchOfGroupId, token.whAdmin, { code: 'E2E-SCOPE-STOLEN' });

      expect(res.status).toBe(403);
      expect(await prisma.group.count({ where: { code: 'E2E-SCOPE-STOLEN' } })).toBe(0);
      expect(await groupRole(scratchOfGroupId)).toBe('OF_USER');
    });

    it('WH_ADMIN は OF 系統のグループの名前も書き換えられない（403）', async () => {
      const before = (await prisma.group.findUniqueOrThrow({ where: { id: scratchOfGroupId } }))
        .name;
      const res = await updateGroup(scratchOfGroupId, token.whAdmin, { name: 'E2E 乗っ取り' });

      expect(res.status).toBe(403);
      expect((await prisma.group.findUniqueOrThrow({ where: { id: scratchOfGroupId } })).name).toBe(
        before,
      );
    });

    it('OF_ADMIN は自分の系統のグループの status を書き換えられる（既存運用の維持）', async () => {
      const res = await updateGroup(scratchOfGroupId, token.ofAdmin, { status: 'INACTIVE' });
      expect(res.status).toBe(200);

      const restore = await updateGroup(scratchOfGroupId, token.ofAdmin, { status: 'ACTIVE' });
      expect(restore.status).toBe(200);
    });

    it('SYS_ADMIN は系統を問わず編集できる（バイパス維持）', async () => {
      const res = await updateGroup(scratchOfGroupId, token.sysAdmin, { name: 'E2E 横断編集' });
      expect(res.status).toBe(200);

      const restore = await updateGroup(scratchOfGroupId, token.sysAdmin, {
        name: 'E2E スコープ検証（事務）',
      });
      expect(restore.status).toBe(200);
    });

    it('担当外の系統は、コードが既存でも 409 ではなく 403（コードの存在を漏らさない）', async () => {
      // v2-425 / 独立レビュー F-7: 系統検査をコード重複の検査より前に置く。
      const res = await createGroup(token.whAdmin, {
        code: 'GRP-OF',
        name: 'E2E コード衝突',
        role: 'OF_USER',
      });

      expect(res.status).toBe(403);
    });

    it('SYS_ADMIN は系統をまたぐ role の書き換えもできる（バイパス維持）', async () => {
      const res = await updateGroup(scratchOfGroupId, token.sysAdmin, { role: 'WH_USER' });
      expect(res.status).toBe(200);
      expect(await groupRole(scratchOfGroupId)).toBe('WH_USER');

      const restore = await updateGroup(scratchOfGroupId, token.sysAdmin, { role: 'OF_USER' });
      expect(restore.status).toBe(200);
      expect(await groupRole(scratchOfGroupId)).toBe('OF_USER');
    });
  });

  // ============================================================
  // 5. グループ削除 → 宛先の消失（宛先が空の掲示は全員可視へ降格する）
  // ============================================================
  describe('掲示の宛先グループの削除', () => {
    it('宛先グループは削除できず、宛先を消すと全員可視へ降格する（機構の実測）', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/announcements')
        .set('Cookie', authCookie(token.sysAdmin))
        .send({
          title: SCRATCH_ANNOUNCEMENT_TITLE,
          bodyMarkdown: 'E2E スコープ検証',
          roleGroupIds: [scratchGroupId],
        });
      expect(created.status).toBe(201);
      const announcementId = created.body.data.id as number;

      // 宛先グループの非メンバーには見えない。
      expect((await getAnnouncement(announcementId, token.ofUser)).status).toBe(404);

      // 宛先グループの削除は 409（宛先が消えると全員可視へ降格するため）。
      const denied = await deleteGroup(scratchGroupId, token.whAdmin);
      expect(denied.status).toBe(409);
      expect(await prisma.group.count({ where: { id: scratchGroupId } })).toBe(1);
      expect((await getAnnouncement(announcementId, token.ofUser)).status).toBe(404);

      // SYS_ADMIN も宛先グループは削除できない（降格は誰の操作でも起こさない）。
      const sysAdminDenied = await deleteGroup(scratchGroupId, token.sysAdmin);
      expect(sysAdminDenied.status).toBe(409);
      expect(await prisma.group.count({ where: { id: scratchGroupId } })).toBe(1);

      // 機構の実測: 宛先行そのものが消えると「宛先なし＝全員可視」へ降格する。
      await prisma.announcementRole.deleteMany({ where: { groupId: scratchGroupId } });
      expect((await getAnnouncement(announcementId, token.ofUser)).status).toBe(200);
    });

    it('所属ユーザーが残るグループの削除は 409（依存データの理由を返す）', async () => {
      await ensureMember(scratchGroupId, userId.ofUser);

      const res = await deleteGroup(scratchGroupId, token.whAdmin);

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('所属ユーザー');
      expect(await prisma.group.count({ where: { id: scratchGroupId } })).toBe(1);

      await prisma.userGroup.deleteMany({ where: { groupId: scratchGroupId } });
    });
  });
});
