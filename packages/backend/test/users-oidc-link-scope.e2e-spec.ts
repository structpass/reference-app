import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { UsersService } from '../src/modules/users/users.service';
import { createE2EApp, issueToken, authCookie, resolveSeedAccount } from './helpers/auth.helper';

/**
 * v2-426: 利用者更新（email + allowOidcLink）から、他者のアカウントへ SSO 連携できるか
 * （v2-412 の security-reviewer 指摘・未実測）の実測と回帰。
 *
 * 指摘された経路: linkOidcSub は「メール一致・未連携・allowOidcLink=true」の3条件だけで
 * 後付けリンクする。users:update を持つ WH_ADMIN / OF_ADMIN が対象利用者のメールを
 * 攻撃者の身元のメールへ書き換え、許可フラグを立てると、その身元での SSO ログインが
 * 対象利用者の行（ロールとグループ所属ごと）へリンクされる。
 *
 * 前提: seed 済み DB。テストが作る行は afterAll で消す。
 */
describe('利用者更新と SSO 連携のスコープ (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;

  const token = {} as Record<string, string>;

  /** 実測ごとに独立した被害者を用意し、テスト間で状態を持ち越さない。 */
  let seq = 0;
  const victims: string[] = [];
  let scopeGroupId: number;

  const NOLINK_EMAIL = 'v2-426-nolink@struct-pass.example';
  const NOLINK_SUB = '00000000-0000-4000-a000-000000002427';

  /**
   * 実測ごとに独立した「攻撃者の身元」（メール + sub）を作る。
   * 実測2 が攻撃者の行を JIT 作成するため、共有すると後続のメール変更が
   * email unique 衝突で 409 になり、実測したい経路と別の理由で落ちる。
   */
  const nextAttacker = () => {
    seq += 1;
    return {
      email: `v2-426-attacker-${seq}@struct-pass.example`,
      sub: `00000000-0000-4000-a000-0000000034${String(seq).padStart(2, '0')}`,
    };
  };

  const putUser = (id: string, tokenValue: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put(`/api/v1/users/${id}`)
      .set('Cookie', authCookie(tokenValue))
      .send(body);

  const getRow = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

  /** 被害者（SYS_ADMIN 以外・役割と所属を持つ有効ユーザー）を1件作る。 */
  const createVictim = async () => {
    seq += 1;
    const email = `v2-426-victim-${seq}@struct-pass.example`;
    const user = await prisma.user.create({
      data: { email, name: `v2-426 被害者 ${seq}`, role: UserRole.WH_ADMIN, isActive: true },
    });
    await prisma.userGroup.create({ data: { userId: user.id, groupId: scopeGroupId } });
    victims.push(user.id);
    return user;
  };

  /** 所属（user_groups）→ ユーザーの順で消す（FK 制約のため）。 */
  const purgeUsers = async (ids: string[]) => {
    if (ids.length === 0) return;
    await prisma.userGroup.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);
    usersService = app.get(UsersService);

    token.admin = await issueToken(app, 'admin');
    token.whAdmin = await issueToken(app, 'whAdmin');
    token.whUser = await issueToken(app, 'whUser');

    const group = await prisma.group.upsert({
      where: { code: 'V2-426-SCOPE' },
      update: {},
      create: { code: 'V2-426-SCOPE', name: 'v2-426 実測用グループ' },
    });
    scopeGroupId = group.id;

    // 前回実行の残骸（v2-426 が作る行）を掃除する。
    const stale = await prisma.user.findMany({
      where: {
        OR: [{ oidcSub: { in: [NOLINK_SUB] } }, { email: { startsWith: 'v2-426-' } }],
      },
      select: { id: true },
    });
    await purgeUsers(stale.map((r) => r.id));
  });

  afterAll(async () => {
    const stale = await prisma.user.findMany({
      where: {
        OR: [{ oidcSub: { in: [NOLINK_SUB] } }, { email: { startsWith: 'v2-426-' } }],
      },
      select: { id: true },
    });
    await purgeUsers([...new Set([...stale.map((r) => r.id), ...victims])]);
    await prisma.group.deleteMany({ where: { id: scopeGroupId } });
    await app.close();
  });

  it('実測1: WH_ADMIN は他者の allowOidcLink を立てられないこと（403）', async () => {
    const victim = await createVictim();
    const attacker = nextAttacker();

    const res = await putUser(victim.id, token.whAdmin, {
      email: attacker.email,
      allowOidcLink: true,
    });

    expect(res.status).toBe(403);

    const row = await getRow(victim.id);
    expect(row.email).toBe(victim.email); // 書き換わらない
    expect(row.allowOidcLink).toBe(false); // 許可も立たない
    expect(row.oidcSub).toBeNull();
  });

  it('実測2: 単独の allowOidcLink 更新も WH_ADMIN は 403 で拒否されること', async () => {
    const victim = await createVictim();

    const res = await putUser(victim.id, token.whAdmin, { allowOidcLink: true });
    expect(res.status).toBe(403);

    const row = await getRow(victim.id);
    expect(row.allowOidcLink).toBe(false);
  });

  it('実測3: 2段の操作（メール変更 → 許可）でも他者の行へは連携できないこと', async () => {
    const victim = await createVictim();
    const attacker = nextAttacker();

    // メール変更だけなら WH_ADMIN でも通る（users:update の正当な用途）。
    const step1 = await putUser(victim.id, token.whAdmin, { email: attacker.email });
    expect(step1.status).toBe(200);

    // 許可は SYS_ADMIN のみ。ここが塞がっていれば 2 段目で止まる。
    const step2 = await putUser(victim.id, token.whAdmin, { allowOidcLink: true });
    expect(step2.status).toBe(403);

    // 書き換え先を名乗る SSO ログインがリンクしないことを実測で確かめる。
    const login = await usersService
      .provisionFromOidc({ sub: attacker.sub, email: attacker.email, name: 'v2-426 攻撃者' })
      .catch(() => null);

    const after = await getRow(victim.id);
    expect(after.oidcSub).toBeNull();
    expect(after.allowOidcLink).toBe(false);
    expect(login?.id === victim.id).toBe(false);
  });

  it('実測4: SYS_ADMIN は従来どおり許可を立てられ、リンクが成立すること（ref-0066 の維持）', async () => {
    const victim = await createVictim();
    const attacker = nextAttacker();

    const res = await putUser(victim.id, token.admin, {
      email: attacker.email,
      allowOidcLink: true,
    });
    expect(res.status).toBe(200);

    const linked = await usersService.provisionFromOidc({
      sub: attacker.sub,
      email: attacker.email,
      name: 'v2-426 攻撃者',
    });

    // SYS_ADMIN の操作は意図した連携として成立する（使い切りフラグの既存挙動を保つ）。
    expect(linked.id).toBe(victim.id);
    const after = await getRow(victim.id);
    expect(after.oidcSub).toBe(attacker.sub);
    expect(after.allowOidcLink).toBe(false);
  });

  it('実測5: 許可済みの行のメールを非 SYS_ADMIN が書き換えても連携先を差し替えられないこと（逆順の迂回）', async () => {
    const victim = await createVictim();
    const attacker = nextAttacker();

    // 1. SYS_ADMIN が正規に許可を立てる（未連携のまま）。
    const allow = await putUser(victim.id, token.admin, { allowOidcLink: true });
    expect(allow.status).toBe(200);

    // 2. その行のメールだけを WH_ADMIN が書き換える。ガードが「立てる操作」限定だとここが通る。
    const retarget = await putUser(victim.id, token.whAdmin, { email: attacker.email });
    expect(retarget.status).toBe(409);

    // 3. 書き換え先を名乗る SSO ログインが、被害者の行へリンクしないこと。
    const login = await usersService
      .provisionFromOidc({ sub: attacker.sub, email: attacker.email, name: 'v2-426 攻撃者' })
      .catch(() => null);

    const after = await getRow(victim.id);
    expect(after.email).toBe(victim.email);
    expect(after.oidcSub).toBeNull();
    expect(login?.id === victim.id).toBe(false);
  });

  it('対照1: users:update を持たない WH_USER は他者の email を書き換えられないこと', async () => {
    const victim = await createVictim();
    const res = await putUser(victim.id, token.whUser, { email: 'v2-426-other@example.com' });
    expect(res.status).toBe(403);

    const row = await getRow(victim.id);
    expect(row.email).toBe(victim.email);
  });

  it('対照2: SYS_ADMIN アカウントは非 SYS_ADMIN の同時更新から保護されること', async () => {
    const attacker = nextAttacker();
    const sysAdmin = await resolveSeedAccount(app, 'admin');
    const res = await putUser(sysAdmin.id, token.whAdmin, {
      email: attacker.email,
      allowOidcLink: true,
    });
    expect(res.status).toBe(403);
  });

  it('対照3: 既存の ref-0066（許可フラグ無しはリンクしない）は緑のままであること', async () => {
    const unlinked = await prisma.user.create({
      data: {
        email: NOLINK_EMAIL,
        name: 'v2-426 未許可',
        role: UserRole.WH_USER,
        isActive: true,
        allowOidcLink: false,
      },
    });
    victims.push(unlinked.id);

    await expect(
      usersService.provisionFromOidc({ sub: NOLINK_SUB, email: NOLINK_EMAIL, name: 'x' }),
    ).rejects.toThrow();

    const row = await getRow(unlinked.id);
    expect(row.oidcSub).toBeNull();
  });

  // ==========================================================================
  // v2-484: 実 HTTP 経路で、保護状態の再評価が**既存の応答を壊していない**ことを固定する。
  //
  // 競合そのもの（読み取り後に許可が commit される窓）は実 PostgreSQL と順序の固定が要るため
  // `users-allow-link-race.int-spec.ts` が測る。ここは射程が異なり、controller の
  // `users:update` 権限・DTO の whitelist・例外フィルタの写像・呼出元ロールの受け渡しまで
  // 通したうえで 200/403/404/409 の組を固定する。
  // ==========================================================================
  describe('v2-484: 実 HTTP の既存応答の維持', () => {
    it('空ボディの PUT でも 200（data が空でも既存行を返し、不在と誤認しない）', async () => {
      const victim = await createVictim();

      const res = await putUser(victim.id, token.whAdmin, {});

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(victim.id);
    });

    it('名前だけの更新は 200', async () => {
      const victim = await createVictim();

      const res = await putUser(victim.id, token.whAdmin, { name: 'v2-484 改名' });

      expect(res.status).toBe(200);
      expect((await getRow(victim.id)).name).toBe('v2-484 改名');
    });

    it('既リンクの行のメール変更は非 SYS_ADMIN でも 200', async () => {
      const victim = await createVictim();
      const sub = '00000000-0000-4000-a000-000000004849';
      await prisma.user.update({ where: { id: victim.id }, data: { oidcSub: sub } });
      const attacker = nextAttacker();

      const res = await putUser(victim.id, token.whAdmin, { email: attacker.email });

      expect(res.status).toBe(200);
      const row = await getRow(victim.id);
      expect(row.email).toBe(attacker.email);
      expect(row.oidcSub).toBe(sub); // 連携は sub で固定される
    });

    it('非 SYS_ADMIN による allowOidcLink=false の解除は 200', async () => {
      const victim = await createVictim();
      await putUser(victim.id, token.admin, { allowOidcLink: true });

      const res = await putUser(victim.id, token.whAdmin, { allowOidcLink: false });

      expect(res.status).toBe(200);
      expect((await getRow(victim.id)).allowOidcLink).toBe(false);
    });

    it('メール重複は 409', async () => {
      const first = await createVictim();
      const second = await createVictim();

      const res = await putUser(first.id, token.whAdmin, { email: second.email });

      expect(res.status).toBe(409);
    });

    it('存在しない id の更新は 404', async () => {
      const res = await putUser('00000000-0000-4000-a000-00000000dead', token.admin, {
        name: 'x',
      });

      expect(res.status).toBe(404);
    });

    it('非 SYS_ADMIN による SYS_ADMIN アカウントの更新は 403', async () => {
      const victim = await createVictim();
      await prisma.user.update({ where: { id: victim.id }, data: { role: UserRole.SYS_ADMIN } });

      const res = await putUser(victim.id, token.whAdmin, { name: 'v2-484 昇格試行' });

      expect(res.status).toBe(403);
      expect((await getRow(victim.id)).name).toBe(victim.name);
    });
  });
});
