import { PrismaService } from '@/database/prisma.service';
import { UsersRepository } from '@/modules/users/repositories/users.repository';
import { UsersService } from '@/modules/users/users.service';
import { UserRole } from '@prisma/client';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * v2-484: 「SSO 連携許可の commit」と「非 SYS_ADMIN のメール更新」が重なった時、許可済み行の
 * メールを差し替えられないことを、実 PostgreSQL 上で順序を固定して確かめる。
 *
 * ## 何を固定するか
 *
 * 欠陥の本体は「判定と書き込みが別の文であること」だった:
 * `users.service.update` は `findById` の状態で認可と保護判定を行い、その後 `findByEmail` を
 * await してから `Repository.update(id, data)`（where は id だけ）を呼ぶ。したがって
 * **読み取りの後に SYS_ADMIN が `allowOidcLink=true` を commit すると、古い false の判定のまま
 * メールが書き換わる**。`linkOidcSub` はメール一致を唯一の引き当てキーにするため、これは
 * 「許可の宛先」を後から付け替えられることに等しい（続く SSO ログインが被害者の行へリンクする）。
 *
 * ここでは `findByEmail` を待機点にして、レビューの実測（auth-race-probe.cjs）と同じ順序を作る:
 *
 *   1. WH_ADMIN のメール更新を `findByEmail` の後で止める
 *   2. SYS_ADMIN が**元のメール**への許可を commit する
 *   3. WH_ADMIN を解放する
 *
 * ## なぜ「旧実装の対照」を置くか
 *
 * 新しい実装が緑でも、その手順が本当に競合を再現していなければ緑は空振りである。
 * 同じ順序を**旧実装の形（id だけの where で無条件に update する）**でも走らせ、
 * メールが攻撃者の値へ差し替わることを確かめる。これが赤くならなければ、
 * 本テストは競合していない緑であり得る（v2-428 の groups-delete-race と同じ作法）。
 *
 * Docker 必須のため通常の `pnpm test` から分離（`pnpm test:int`）。
 */
describe('利用者更新と SSO 連携許可の競合 — 実DB統合 (v2-484)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;
  let repo: UsersRepository;
  let service: UsersService;

  let seq = 0;
  const nextEmail = (tag: string) => {
    seq += 1;
    return `v2-484-${tag}-${seq}@struct-pass.example`;
  };
  const ATTACKER_SUB = '00000000-0000-4000-a000-000000004840';

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** 被害者（非 SYS_ADMIN・有効・役割つき）を1件作る。 */
  const createVictim = () =>
    prisma.user.create({
      data: {
        name: 'v2-484 victim',
        email: nextEmail('victim'),
        role: UserRole.OF_ADMIN,
        isActive: true,
      },
    });

  /**
   * `findByEmail` を待機点にする。指定メールの照会で到達を通知し、gate の解決まで戻らない。
   * レビューの実測（auth-race-probe.cjs）が使ったのと同じ差し込み方で、
   * 「読み取りは終わったが書き込みはまだ」という窓を決定的に作る。
   */
  const pauseFindByEmail = (targetEmail: string) => {
    let markReached: () => void = () => {};
    const reached = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const original = repo.findByEmail.bind(repo);
    repo.findByEmail = async (email: string) => {
      const result = await original(email);
      if (email === targetEmail) {
        markReached();
        await gate;
      }
      return result;
    };
    return {
      reached,
      releaseGate,
      restore: () => {
        repo.findByEmail = original;
      },
    };
  };

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    // 先行（許可の commit）と後続（メール更新）を別接続で本当に競合させる。
    prisma = new PrismaService({ datasourceUrl: `${db.databaseUrl}?connection_limit=10` });
    await prisma.$connect();
    repo = new UsersRepository(prisma);
    service = new UsersService(repo);
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  beforeEach(async () => {
    // 所属 → 利用者の順で消す（user_groups が users を参照するため、逆順だと FK で止まる）。
    await prisma.userGroup.deleteMany({
      where: { user: { email: { startsWith: 'v2-484-' } } },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ email: { startsWith: 'v2-484-' } }, { oidcSub: ATTACKER_SUB }] },
    });
    await prisma.group.deleteMany({ where: { code: { startsWith: 'V2-484-LOCK-' } } });
  });

  // ==========================================================================
  // 受入条件1: レビューと同じ順序を固定する
  // ==========================================================================
  it('受入条件1: 許可 commit 後に解放された非 SYS_ADMIN のメール更新は 409 で拒否される', async () => {
    const victim = await createVictim();
    const attackerEmail = nextEmail('attacker');

    const pause = pauseFindByEmail(attackerEmail);
    // 後続: WH_ADMIN のメール更新（findByEmail の後で止まる）
    const pending = service.update(victim.id, { email: attackerEmail }, UserRole.WH_ADMIN);
    await pause.reached;

    // 先行: SYS_ADMIN が**元のメール**への許可を commit する
    await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);
    const afterGrant = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    // 先行が確かに commit されたことを固定する（ここが false なら競合を作れていない）
    expect(afterGrant.allowOidcLink).toBe(true);
    expect(afterGrant.email).toBe(victim.email);

    // 解放 → 後続は古い判定のまま書き込もうとする
    pause.releaseGate();
    await expect(pending).rejects.toMatchObject({ status: 409 });
    pause.restore();

    // 受入条件1: 元の email / oidcSub / 許可状態が保たれる
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(victim.email);
    expect(after.oidcSub).toBeNull();
    expect(after.allowOidcLink).toBe(true);
  }, 60000);

  it('受入条件1: 競合後に攻撃者のメールを名乗る SSO ログインが被害者の行へリンクしない', async () => {
    const victim = await createVictim();
    const attackerEmail = nextEmail('attacker');

    const pause = pauseFindByEmail(attackerEmail);
    const pending = service.update(victim.id, { email: attackerEmail }, UserRole.WH_ADMIN);
    await pause.reached;
    await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);
    pause.releaseGate();
    await expect(pending).rejects.toMatchObject({ status: 409 });
    pause.restore();

    // 攻撃者のメールを名乗る SSO ログインを実際に走らせる。被害者の行のメールは元のままなので、
    // linkOidcSub の「メール一致」条件に当たらず、被害者の行は奪われない。
    const linked = await service.provisionFromOidc({
      sub: ATTACKER_SUB,
      email: attackerEmail,
      name: 'v2-484 attacker',
    });

    expect(linked.id).not.toBe(victim.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.oidcSub).toBeNull();
    expect(after.email).toBe(victim.email);
  }, 60000);

  // ==========================================================================
  // 対照: 同じ手順を旧実装の形で走らせると差し替わる（この手順が競合を再現している証明）
  // ==========================================================================
  it('対照: 同じ順序を旧実装の形で走らせるとメールが差し替わる（競合を再現している）', async () => {
    const victim = await createVictim();
    const attackerEmail = nextEmail('attacker');

    const pause = pauseFindByEmail(attackerEmail);
    // 旧実装の形: findById の状態で判定し、findByEmail の後に id だけの where で書き込む。
    // 呼出元ロールは引数で受ける（リテラルに固定すると「非 SYS_ADMIN か」の判定が無意味になり、
    // 型検査が比較を畳んでしまう。旧実装の分岐をそのまま再現するため引数のまま扱う）。
    const legacyUpdateEmail = async (callerRole: UserRole, nextEmail: string) => {
      const existing = await repo.findById(victim.id);
      if (!existing) throw Object.assign(new Error('not found'), { status: 404 });
      if (
        callerRole !== UserRole.SYS_ADMIN &&
        existing.oidcSub === null &&
        existing.allowOidcLink
      ) {
        throw Object.assign(new Error('conflict'), { status: 409 });
      }
      const taken = await repo.findByEmail(nextEmail);
      if (taken) throw Object.assign(new Error('taken'), { status: 409 });
      // 旧実装が呼んでいた形（where は id だけ）。
      return repo.update(victim.id, { email: nextEmail });
    };
    const pending = legacyUpdateEmail(UserRole.WH_ADMIN, attackerEmail);

    await pause.reached;
    await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);
    pause.releaseGate();
    await pending;
    pause.restore();

    // 旧実装ではここが差し替わる（赤くなる側）。これが起きなければ競合を再現できていない。
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(attackerEmail);
    expect(after.allowOidcLink).toBe(true);
  }, 60000);

  // ==========================================================================
  // 受入条件2: 対照（逆順・既リンク・許可なし・SYS_ADMIN の正当用途）
  // ==========================================================================
  it('受入条件2: 逆順（先に許可が立ち、その後で非 SYS_ADMIN がメール変更）も 409 で拒否される', async () => {
    const victim = await createVictim();
    await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);

    await expect(
      service.update(victim.id, { email: nextEmail('attacker') }, UserRole.WH_ADMIN),
    ).rejects.toMatchObject({ status: 409 });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(victim.email);
    expect(after.allowOidcLink).toBe(true);
  }, 60000);

  it('受入条件2: 許可なしの行のメールは非 SYS_ADMIN でも変更できる', async () => {
    const victim = await createVictim();
    const newEmail = nextEmail('renamed');

    const result = await service.update(victim.id, { email: newEmail }, UserRole.WH_ADMIN);

    expect(result.success).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(newEmail);
  }, 60000);

  it('受入条件2: 既リンクの行のメールは非 SYS_ADMIN でも変更できる（連携は sub で固定）', async () => {
    const victim = await createVictim();
    await prisma.user.update({
      where: { id: victim.id },
      data: { oidcSub: '00000000-0000-4000-a000-000000004841' },
    });
    const newEmail = nextEmail('relinked');

    const result = await service.update(victim.id, { email: newEmail }, UserRole.WH_ADMIN);

    expect(result.success).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(newEmail);
    expect(after.oidcSub).toBe('00000000-0000-4000-a000-000000004841');
  }, 60000);

  it('受入条件2: SYS_ADMIN は許可済みの行のメールも変更できる（正当な用途を維持）', async () => {
    const victim = await createVictim();
    await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);
    const fixedEmail = nextEmail('fixed');

    const result = await service.update(victim.id, { email: fixedEmail }, UserRole.SYS_ADMIN);

    expect(result.success).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(fixedEmail);
    expect(after.allowOidcLink).toBe(true);
  }, 60000);

  // ==========================================================================
  // 既知の不完全さを固定する（v2-484 の独立レビューが指摘した「直列の2段操作」）
  //
  // 非 SYS_ADMIN がメールを変更し、その後に SYS_ADMIN が**その新しいメール**へ許可を立てると、
  // 「攻撃者のメール＋許可済み」の組み合わせが残る（両方 200）。
  // ただし成立には **SYS_ADMIN が攻撃者のメールへ許可を立てる**必要があり、ADR 0027 が
  // 「SYS_ADMIN 自身が不正を行う経路は残る」として既知の不完全さに挙げたものと同じである。
  //
  // 本票が閉じたのは「許可が先・差し替えが後」の順序で、そちらは 409 になる（上の it）。
  // この2つを並べておくことで、閉じた側と閉じていない側の境界が実体で読める。
  // ==========================================================================
  it('既知の不完全さ: 直列の2段操作（メール変更 → そのメールへ許可）は残る（SYS_ADMIN の加担が必要）', async () => {
    const victim = await createVictim();
    const attackerEmail = nextEmail('attacker');

    // 1段目: 非 SYS_ADMIN がメールを変更する（許可は立っていないので通る）
    const step1 = await service.update(victim.id, { email: attackerEmail }, UserRole.WH_ADMIN);
    expect(step1.success).toBe(true);

    // 2段目: SYS_ADMIN が**その新しいメール**へ許可を立てる
    const step2 = await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);
    expect(step2.success).toBe(true);

    // 組み合わせが残る（この経路を閉じるには「誰がそのメールの所有者か」の確認が要り、
    // データモデルの変更になる = ADR 0027 の既知の不完全さ）
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(attackerEmail);
    expect(after.allowOidcLink).toBe(true);

    // 対照: 逆順（許可が先）は本票の修復で 409 になる
    const other = await createVictim();
    await service.update(other.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);
    const blocked = service.update(other.id, { email: nextEmail('blocked') }, UserRole.WH_ADMIN);
    await expect(blocked).rejects.toMatchObject({ status: 409 });
  }, 60000);

  it('受入条件2: 非 SYS_ADMIN による許可の解除（allowOidcLink=false）は通る', async () => {
    const victim = await createVictim();
    await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);

    const result = await service.update(victim.id, { allowOidcLink: false }, UserRole.WH_ADMIN);

    expect(result.success).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.allowOidcLink).toBe(false);
  }, 60000);

  it('受入条件2: 許可済みの行の通常 SSO（linkOidcSub）は従来どおりリンクする', async () => {
    const victim = await createVictim();
    await service.update(victim.id, { allowOidcLink: true }, UserRole.SYS_ADMIN);

    const linked = await service.provisionFromOidc({
      sub: ATTACKER_SUB,
      email: victim.email,
      name: 'v2-484 legit sso',
    });

    expect(linked.id).toBe(victim.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.oidcSub).toBe(ATTACKER_SUB);
    expect(after.allowOidcLink).toBe(false); // 使い切りフラグが消費される
  }, 60000);

  it('受入条件2: 空ボディ相当（data が空）でも既存行を返し、不在と誤認しない', async () => {
    const victim = await createVictim();

    // UpdateUserDto は全項目が任意なので空ボディの PUT が通る。
    const result = await service.update(victim.id, {}, UserRole.WH_ADMIN);

    expect(result.success).toBe(true);
    expect(result.data.id).toBe(victim.id);
  }, 60000);

  it('受入条件2: 存在しない id は 404 のまま（不在は不在として返る）', async () => {
    await expect(
      service.update('00000000-0000-4000-a000-00000000dead', { name: 'x' }, UserRole.SYS_ADMIN),
    ).rejects.toMatchObject({ status: 404 });
  }, 60000);

  // ==========================================================================
  // ロックの強さの選択を固定する（v2-484 の実測にもとづく）
  //
  // 対象行の固定は `FOR NO KEY UPDATE` を採る。理由は実測にもとづく:
  //   - 同じ行への素の update（同じ強さ）とは衝突するので、読み取り後に許可が commit される
  //     窓は閉じる（実測: 先行の保持で後続の素の update が 377ms 待たされ、解放後は P2025）。
  //   - users を参照する行の挿入（外部キー検査の FOR KEY SHARE）は待たせない
  //     （実測: `FOR SHARE` 保持中の所属追加が 341ms 待ち、`FOR NO KEY UPDATE` なら 6ms）。
  //
  // 下の it は「実装がその強さで固定している」ことを、**固定の取得そのもの**で測る。
  // テスト側で自分で SELECT ... FOR ... を書くと実装の強さに関係なく緑になる（空振り）ため、
  // 実装が固定を取った同じ瞬間に、別接続から参照行の挿入を投げて待ち時間を見る。
  // 実装が `FOR SHARE` なら参照行の挿入が待たされて赤くなる。
  // ==========================================================================
  it('ロックの強さ: 実装の固定中に所属追加（users を参照する挿入）が待たされない', async () => {
    const victim = await createVictim();
    const group = await prisma.group.create({
      data: { code: `V2-484-LOCK-${++seq}`, name: 'v2-484 lock probe' },
    });

    // 実装がロックを取った直後・書き込む前に止める。待機点は $queryRaw の後ろに置く:
    // updateGuarded は「(1) SELECT ... FOR ...」「(2) 照合」「(3) update」の順に進むので、
    // (1) の直後で止めれば固定は保持されたままである。tx の $queryRaw は差し替えが効かない
    // ため、**親の $queryRaw を包んで** (1) の完了を観測する（interactive transaction の
    // 内部でも、実装が呼ぶ tx.$queryRaw は同じクエリエンジンを通る）。
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const observed: string[] = [];
    const originalTransaction = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = async (fn: any, opts: any) =>
      originalTransaction(async (tx: any) => {
        // tx.$queryRaw は getter 経由で組まれるため直接の差し替えが効かない。
        // 代わりに、トランザクションが「固定を取り終えた合図」を Proxy で捕まえる。
        const proxied = new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop === '$queryRaw') {
              return async (...args: any[]) => {
                const sql = Array.isArray(args[0]) ? args[0].join('?') : String(args[0]);
                observed.push(sql);
                const result = await target.$queryRaw.apply(target, args);
                if (/FOR\s+(NO\s+KEY\s+)?(SHARE|UPDATE)/i.test(sql)) {
                  markLocked();
                  await gate;
                }
                return result;
              };
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return fn(proxied);
      }, opts);

    try {
      const pending = service.update(victim.id, { name: 'v2-484 lock target' }, UserRole.WH_ADMIN);
      await locked; // 実装が固定を取り、まだ commit していない

      // この間の参照行の挿入が待たされないこと（FOR SHARE なら待たされる）。
      const startedAt = Date.now();
      await prisma.userGroup.create({ data: { groupId: group.id, userId: victim.id } });
      const elapsed = Date.now() - startedAt;

      releaseGate();
      const result = await pending;

      expect(result.success).toBe(true);
      // `FOR SHARE` は参照行の挿入（FOR KEY SHARE）を待たせるため、実装が `FOR SHARE` なら
      // ここが 1000ms を超えて赤くなる。余白は実測で約 6ms 対 341ms。
      expect(elapsed).toBeLessThan(1000);
      // 実装が実際に発行した固定の SQL を記録として残す（強さの選択の根拠）。
      // この assert が空配列に対して成立しないことは、`FOR SHARE` へ戻すと赤くなることで確認済み。
      expect(observed.some((sql) => /FOR\s+NO\s+KEY\s+UPDATE/i.test(sql))).toBe(true);
    } finally {
      (prisma as any).$transaction = originalTransaction;
    }

    await prisma.userGroup.deleteMany({ where: { groupId: group.id } });
  }, 60000);

  // ==========================================================================
  // 受入条件2: 保護状態の別軸（role / oidcSub）でも古い判定で通らないこと
  // ==========================================================================
  it('受入条件2: 事前読取の後に role が変わっていた場合も、古い判定で書き込まない', async () => {
    const victim = await createVictim(); // OF_ADMIN
    const otherEmail = nextEmail('other');

    // 事前読取と書き込みの間に role を SYS_ADMIN へ昇格させる。
    const pause = pauseFindByEmail(otherEmail);
    const pending = service.update(victim.id, { email: otherEmail }, UserRole.WH_ADMIN);
    await pause.reached;
    await prisma.user.update({ where: { id: victim.id }, data: { role: UserRole.SYS_ADMIN } });
    pause.releaseGate();
    await expect(pending).rejects.toMatchObject({ status: 409 });
    pause.restore();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(victim.email);
    expect(after.role).toBe(UserRole.SYS_ADMIN);
  }, 60000);

  it('受入条件2: 事前読取の後にリンク（oidcSub）が入っていた場合も、古い判定で書き込まない', async () => {
    const victim = await createVictim();
    const attackerEmail = nextEmail('attacker');

    // 起点は「未連携かつ許可なし」＝非 SYS_ADMIN でもメール変更が通る状態にする。
    // こうしないと事前読取の段階で既存ガードが 409 を返し、競合の窓に入らない
    // （ガードが先に効くこと自体は正しい挙動で、ここで測たいのは「窓に入った後」）。
    const pause = pauseFindByEmail(attackerEmail);
    const pending = service.update(victim.id, { email: attackerEmail }, UserRole.WH_ADMIN);
    await pause.reached;
    // 先行: その間に SYS_ADMIN の許可と SSO ログインが成立してリンクが入る。
    await prisma.user.update({
      where: { id: victim.id },
      data: { oidcSub: '00000000-0000-4000-a000-000000004842', allowOidcLink: true },
    });
    pause.releaseGate();
    await expect(pending).rejects.toMatchObject({ status: 409 });
    pause.restore();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.email).toBe(victim.email);
    expect(after.oidcSub).toBe('00000000-0000-4000-a000-000000004842');
    expect(after.allowOidcLink).toBe(true);
  }, 60000);
});
