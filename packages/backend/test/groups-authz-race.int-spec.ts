import { UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { GroupsRepository } from '@/modules/groups/repositories/groups.repository';
import { GroupsService } from '@/modules/groups/groups.service';
import { UsersRepository } from '@/modules/users/repositories/users.repository';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * v2-485: グループの担当系統（`Group.role` / `User.role`）を SYS_ADMIN が同時に書き換えた時、
 * 変更前の系統で認可した編成・編集が通ってしまわないことを、実 PostgreSQL 上で確かめる。
 *
 * ## 競合の順序（ここが本票の芯）
 *
 * 直列化の効き方は**ロックを取る順**で決まる。実 PostgreSQL 16 の実測:
 *   - 系統変更が commit した**後**に固定を取った側は、**変更後の role** を読む
 *   - 固定を先に取った側は、系統変更がその固定と衝突して commit できないため、**変更前の role** を読む
 *
 * 本票が閉じたいのは前者の窓である。修正前の実装は「事前読みで認可 → 書込み」の間に系統変更が
 * 入ると、**変更前の role で認可したまま書いていた**（＝変更後に固定を取る側なのに読み直さない）。
 *
 * したがってテストは「**系統変更を先に commit させ、その後に検査対象の固定を取らせる**」順序を
 * 決定的に作る。検査対象の事前読み（`findById`）と固定（トランザクション）の間に系統変更を
 * 割り込ませるため、Repository の `findById` を1回だけ止めるゲートを噛ませる。
 *
 * 対照（旧実装の形）も同じ file に置く。対照が赤くならなければ、修正後の緑は
 * 「競合していない緑」であり得る（v2-428/446/463 と同じ作法）。
 *
 * Docker 必須のため通常の `pnpm test` から分離（`pnpm test:int`）。
 */
describe('グループの系統変更と編成・編集の競合 — 実DB統合 (v2-485)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;

  let seq = 0;
  const nextCode = () => `INT-AUTHZ-${++seq}`;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const createWhGroup = async () =>
    (
      await prisma.group.create({
        data: { code: nextCode(), name: '競合用グループ', role: UserRole.WH_USER },
      })
    ).id;

  const createUser = async (role: UserRole = UserRole.WH_USER) =>
    (
      await prisma.user.create({
        data: {
          name: `int-authz-${++seq}`,
          email: `int-authz-${seq}-${Date.now()}@test.local`,
          role,
        },
      })
    ).id;

  const currentGroupRole = async (groupId: number) =>
    (await prisma.group.findUnique({ where: { id: groupId } }))?.role;
  const memberCount = (groupId: number, userId: string) =>
    prisma.userGroup.count({ where: { groupId, userId } });
  const groupName = async (groupId: number) =>
    (await prisma.group.findUnique({ where: { id: groupId } }))?.name;

  /**
   * 検査対象の Service を作る。`findById` の**1回目の呼び出し**（＝事前読み）の直後に
   * `onPreRead` を待たせる（既定は即時）。ここで系統変更を commit させることで、
   * 「事前読み → 系統変更 commit → 固定して認可」の順序を決定的に作れる。
   */
  const buildServiceWithPreReadGate = (
    onPreRead?: () => Promise<void>,
  ): { service: GroupsService; calls: { preReads: number } } => {
    const repo = new GroupsRepository(prisma);
    const usersRepo = new UsersRepository(prisma);
    const calls = { preReads: 0 };

    if (onPreRead) {
      const originalGroupFindById = repo.findById.bind(repo);
      repo.findById = async (id: number) => {
        const group = await originalGroupFindById(id);
        calls.preReads += 1;
        await onPreRead();
        return group;
      };
    }

    return { service: new GroupsService(repo, usersRepo), calls };
  };

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    prisma = new PrismaService({ datasourceUrl: `${db.databaseUrl}?connection_limit=10` });
    await prisma.$connect();
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await prisma.userGroup.deleteMany();
    await prisma.announcementRole.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
  });

  it('受入条件1: 系統変更の commit 後、編成（addMember）は 403 になり所属行が増えない', async () => {
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);

    // 事前読みの直後に系統変更を commit させる（＝変更後に固定を取る側になる）。
    const { service } = buildServiceWithPreReadGate(async () => {
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.OF_USER } });
    });

    await expect(
      service.addMember(groupId, userId, 'caller-wh-admin', UserRole.WH_ADMIN),
    ).rejects.toThrow(ForbiddenException);

    expect(await memberCount(groupId, userId)).toBe(0);
  }, 60000);

  it('受入条件1: 系統変更の commit 後、編集（update）は 403 になり name が変わらない', async () => {
    const groupId = await createWhGroup();
    await createUser(UserRole.WH_USER);

    const { service } = buildServiceWithPreReadGate(async () => {
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.OF_USER } });
    });

    await expect(
      service.update(groupId, { name: '書き換え後' }, UserRole.WH_ADMIN),
    ).rejects.toThrow(ForbiddenException);

    expect(await groupName(groupId)).toBe('競合用グループ');
  }, 60000);

  it('受入条件2: 所属削除も同じ境界に閉じる（403・所属行が残る）', async () => {
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);
    await prisma.userGroup.create({ data: { groupId, userId } });

    const { service } = buildServiceWithPreReadGate(async () => {
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.OF_USER } });
    });

    await expect(service.removeMember(groupId, userId, UserRole.WH_ADMIN)).rejects.toThrow(
      ForbiddenException,
    );

    expect(await memberCount(groupId, userId)).toBe(1);
  }, 60000);

  it('受入条件2: グループが SYS_ADMIN 化した後に編成すると 403 になる', async () => {
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);

    const { service } = buildServiceWithPreReadGate(async () => {
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.SYS_ADMIN } });
    });

    await expect(
      service.addMember(groupId, userId, 'caller-wh-admin', UserRole.WH_ADMIN),
    ).rejects.toThrow(ForbiddenException);

    expect(await memberCount(groupId, userId)).toBe(0);
  }, 60000);

  it('受入条件2: 対象利用者が SYS_ADMIN 化した後に編成すると 403 になる', async () => {
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);

    // 利用者の系統変更は事前読み（usersRepo.findById）の後に commit させる。
    const repo = new GroupsRepository(prisma);
    const usersRepo = new UsersRepository(prisma);
    const originalUsersFindById = usersRepo.findById.bind(usersRepo);
    usersRepo.findById = async (id: string) => {
      const user = await originalUsersFindById(id);
      await prisma.user.update({ where: { id: userId }, data: { role: UserRole.SYS_ADMIN } });
      return user;
    };
    const service = new GroupsService(repo, usersRepo);

    await expect(
      service.addMember(groupId, userId, 'caller-wh-admin', UserRole.WH_ADMIN),
    ).rejects.toThrow(ForbiddenException);

    expect(await memberCount(groupId, userId)).toBe(0);
  }, 60000);

  it('受入条件3: 対照 — 事前読みで認可して無条件に書く旧形は、同じ順序で通ってしまう', async () => {
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);

    // 旧実装の形: 事前読みの role で判定し、その後で無条件に create する。
    const legacyAddMember = async () => {
      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) throw new Error('not found');
      // ここが欠陥の芯: 事前読みの role で判定する。
      if (group.role !== UserRole.WH_USER) throw new ForbiddenException('legacy: out of scope');
      // 判定の後に系統変更が commit される。
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.OF_USER } });
      return prisma.userGroup.create({ data: { userId, groupId } });
    };

    // 旧形は系統変更後に書くため、OF 系統のグループへ WH_ADMIN の追加が成立してしまう。
    await expect(legacyAddMember()).resolves.toMatchObject({ groupId, userId });
    expect(await memberCount(groupId, userId)).toBe(1);
    expect(await currentGroupRole(groupId)).toBe(UserRole.OF_USER);
  }, 60000);

  it('受入条件2: 担当内の正常操作は維持される（退行なし）', async () => {
    const { service } = buildServiceWithPreReadGate();
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);

    const added = await service.addMember(groupId, userId, 'caller-wh-admin', UserRole.WH_ADMIN);
    expect(added.success).toBe(true);
    expect(await memberCount(groupId, userId)).toBe(1);

    const updated = await service.update(groupId, { name: '通常の編集' }, UserRole.WH_ADMIN);
    expect(updated.success).toBe(true);
    expect(await groupName(groupId)).toBe('通常の編集');

    const removed = await service.removeMember(groupId, userId, UserRole.WH_ADMIN);
    expect(removed.success).toBe(true);
    expect(await memberCount(groupId, userId)).toBe(0);
  }, 60000);

  it('受入条件2: SYS_ADMIN は系統を問わず編成・編集できる（バイパス維持）', async () => {
    const { service } = buildServiceWithPreReadGate();
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.OF_USER);

    const added = await service.addMember(groupId, userId, 'caller-sys', UserRole.SYS_ADMIN);
    expect(added.success).toBe(true);

    const updated = await service.update(groupId, { role: UserRole.OF_ADMIN }, UserRole.SYS_ADMIN);
    expect(updated.success).toBe(true);
  }, 60000);

  it('受入条件3: 存在しないグループ・利用者は固定時点の不在として既存の 404 を返す', async () => {
    const { service } = buildServiceWithPreReadGate();
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);

    await expect(
      service.addMember(99999999, userId, 'caller-wh-admin', UserRole.WH_ADMIN),
    ).rejects.toThrow('Group not found');

    await expect(
      service.addMember(
        groupId,
        '00000000-0000-0000-0000-000000000000',
        'caller-wh-admin',
        UserRole.WH_ADMIN,
      ),
    ).rejects.toThrow('User not found');
  }, 60000);

  it('受入条件3: 既存所属の追加は 409 のまま（固定時点の所属行を見る）', async () => {
    const { service } = buildServiceWithPreReadGate();
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);
    await prisma.userGroup.create({ data: { groupId, userId } });

    await expect(
      service.addMember(groupId, userId, 'caller-wh-admin', UserRole.WH_ADMIN),
    ).rejects.toThrow('User is already a member of this group');
    expect(await memberCount(groupId, userId)).toBe(1);
  }, 60000);

  it('受入条件3: 固定した行が同時に消えた場合は既存の 404 に揃える', async () => {
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_USER);

    // 事前読みの後、固定を取る前にグループが消える。
    const { service } = buildServiceWithPreReadGate(async () => {
      await prisma.group.delete({ where: { id: groupId } });
    });

    await expect(
      service.addMember(groupId, userId, 'caller-wh-admin', UserRole.WH_ADMIN),
    ).rejects.toThrow('Group not found');
  }, 60000);

  it('受入条件2: 所属追加は別の所属追加を待たせない（不要な直列化を作らない）', async () => {
    const { service } = buildServiceWithPreReadGate();
    const groupA = await createWhGroup();
    const groupB = await createWhGroup();
    const userA = await createUser(UserRole.WH_USER);
    const userB = await createUser(UserRole.WH_USER);

    // 片方の追加を「固定を取った後・commit 前」で止め、その間に別グループ・別利用者への追加を
    // 通す。固定が `FOR NO KEY UPDATE` なので、他所の所属追加や外部キー検査とは衝突しない。
    // `FOR UPDATE` へ強めると **同じグループへの** 追加（外部キー検査の `FOR KEY SHARE`）が
    // 待たされる。ここでは別グループなので、強めても待たない点に注意（対象は直列化の不在）。
    let release: () => void = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: () => void = () => {};
    const heldP = new Promise<void>((resolve) => {
      held = resolve;
    });

    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupA} FOR NO KEY UPDATE`;
        held();
        await hold;
      },
      { timeout: 60000, maxWait: 10000 },
    );
    await heldP;

    const startedAt = Date.now();
    const other = await service.addMember(groupB, userB, 'caller-wh-admin', UserRole.WH_ADMIN);
    const elapsed = Date.now() - startedAt;

    release();
    await holder;

    expect(other.success).toBe(true);
    // 先行が groupA を固定している間も、groupB への追加は待たずに通る（実測 1 秒未満。
    // 固定の範囲は対象行だけであることの確認）。
    expect(elapsed).toBeLessThan(1000);

    // 同じグループへの追加（外部キー検査が親行の `FOR KEY SHARE` を取る）も、
    // `FOR NO KEY UPDATE` とは衝突しない。ここは順序を固定せず、通ることを見る。
    const same = await service.addMember(groupA, userA, 'caller-wh-admin', UserRole.WH_ADMIN);
    expect(same.success).toBe(true);
  }, 60000);

  it('受入条件3: 自分の追加は固定した行の id で判定する（SYS_ADMIN 以外は拒否）', async () => {
    const { service } = buildServiceWithPreReadGate();
    const groupId = await createWhGroup();
    const userId = await createUser(UserRole.WH_ADMIN);

    await expect(service.addMember(groupId, userId, userId, UserRole.WH_ADMIN)).rejects.toThrow(
      '自分自身をグループへ追加することはできません',
    );
    expect(await memberCount(groupId, userId)).toBe(0);
  }, 60000);
});
