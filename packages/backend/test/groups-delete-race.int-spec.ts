import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { UsersRepository } from '@/modules/users/repositories/users.repository';
import { GroupsRepository } from '@/modules/groups/repositories/groups.repository';
import { GroupsService } from '@/modules/groups/groups.service';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * v2-428: 同一グループへの同時 DELETE が 500（Prisma P2025）にならないことを、実 PostgreSQL 上で
 * 行ロックの競合を直列化させて確かめる統合テスト。
 *
 * e2e（`groups-write-guards.e2e-spec.ts`）は実 API の応答の組（200 と 404）を固定するが、
 * 2 本が本当に行ロックで競合したかは HTTP の重なり方に依存する。ここでは順序を明示して
 * 「先行が行ロックを取って削除し、後続がロック待ちから戻って行の不在を見る」形を作る。
 *
 * 同じ手順を **旧実装の形（固定の後に無条件で delete する）** でも走らせ、P2025 が投げられることを
 * 確かめる。これが「この手順が本当に競合を再現している」ことの対照で、新しい実装が
 * `missing: true` を返すだけの空振り（競合していない緑）ではないことを示す。
 *
 * v2-446 で**更新（PUT）側の双子**を足した（末尾の describe）。`findById` の確認と `group.update` の
 * 間に別トランザクションが同じ行を削除すると P2025 になり、同じ「行が無い」状態に応答が2通りできていた。
 * `updateIfPresent` は削除側と同じく固定の取得結果を在否の判定に使う。`updateMany` の `count` で判定する
 * 形（空 `data` では既存行でも 0 になり、行が無い場合と区別できない）へ戻すと赤くなる行も置いてある。
 *
 * v2-446 の独立レビュー（F-1 / F-2）で見つかった2つの副作用も、この describe で固定する:
 *   - 固定は `FOR NO KEY UPDATE`。素の `FOR UPDATE` は外部キー検査の `FOR KEY SHARE` とも衝突し、
 *     同じグループへの所属追加を待たせる（所属追加を開いたまま更新を呼ぶ行が赤くなる）。
 *   - `$transaction` に timeout を明示する。既定の 5 秒に掛かると、5 秒超のロック待ちが P2028
 *     （→ 503）になり、旧実装の 404 に対して退行する（6.5 秒保持の行が赤くなる）。
 *
 * v2-463 で**削除側の同じ崖**を閉じた（`deleteIfUnreferenced` は options を渡していなかった）。
 * 削除にも「5 秒超の保持で `missing: true`（→ 404 相当）」と「timeout 無しの旧形は P2028」の
 * 対を置いてあり、timeout を外すと1本目が赤くなる。
 *
 * Docker 必須のため通常の `pnpm test` から分離（`pnpm test:int`）。
 */
describe('グループ削除の行ロック競合 — 実DB統合 (v2-428)', () => {
  let db: IntegrationDb;
  let prisma: PrismaService;
  let repo: GroupsRepository;
  let usersRepo: UsersRepository;

  let seq = 0;
  const nextCode = () => `INT-RACE-${++seq}`;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** 使い捨てグループを1つ作る。 */
  const createGroup = async (code: string) =>
    (await prisma.group.create({ data: { code, name: code } })).id;

  /**
   * v2-532: 認可が常に通る（固定した行を拒否しない）削除。
   *
   * v2-428 / v2-446 / v2-463 が固定してきた「同時削除で P2025 にしない」「timeout を明示して
   * 404 相当へ到達させる」挙動は、削除の Repository メソッドを1本にした後も
   * `deleteWithAuthorization` が持つ。素の `delete` と、固定だけして最新行で認可しない旧
   * `deleteIfUnreferenced` は残さない（次に誰かが使うと、v2-532 で閉じた穴が戻る）。
   */
  const deleteWhenFound = (groupId: number) => repo.deleteWithAuthorization(groupId, () => {});

  /**
   * 先行トランザクション（行ロックを取って削除する）。ロック取得後に `onLocked` を呼び、
   * `gate` が解決するまで commit しない。後続の呼び出しがロック待ちに入る窓を作る。
   */
  const holdThenDelete = (groupId: number, onLocked: () => void, gate: Promise<void>) =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE`;
      onLocked();
      await gate;
      await tx.group.delete({ where: { id: groupId } });
    });

  /** 旧実装の形: 固定の後に無条件で delete する（後続は行が無いので P2025 になる）。 */
  const oldStyleDelete = (groupId: number) =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE`;
      const members = await tx.userGroup.count({ where: { groupId } });
      const audiences = await tx.announcementRole.count({ where: { groupId } });
      if (members === 0 && audiences === 0) {
        await tx.group.delete({ where: { id: groupId } });
      }
      return { members, audiences };
    });

  /**
   * 更新側（v2-446）の対照。旧実装の形: 固定を取らずに無条件で `group.update` を投げる。
   * 先行が削除した後にロック待ちから戻ると行が無いため P2025（No record was found for an update）になる。
   */
  const oldStyleUpdate = (groupId: number, data: { name: string }) =>
    prisma.group.update({ where: { id: groupId }, data });

  /** ロック保持の窓を作る（leader を起動し、FOR UPDATE を取ったら locked を解決する）。 */
  const startLeader = (groupId: number) => {
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const leader = holdThenDelete(groupId, markLocked, gate);
    return { leader, locked, releaseGate };
  };

  /**
   * 固定を取って `holdMs` 保持してから削除する先行（timeout 明示の長い interactive tx）。
   * 後続のロック待ちが Prisma の既定 timeout（5 秒）を超える窓を作るために使う（v2-446 / F-1）。
   *
   * 固定は `FOR NO KEY UPDATE`。PostgreSQL の行ロックの衝突表では `FOR NO KEY UPDATE` は
   * `FOR UPDATE` と**双方向に衝突する**ため、削除側（v2-463）の後続 `FOR UPDATE` も
   * この保持で待たされる（同じ行・同じ保持に対する崖を、更新側と削除側で同じ作り方で再現できる）。
   */
  const startLeaderWithHold = (groupId: number, holdMs: number) => {
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const leader = prisma.$transaction(
      async (tx) => {
        // 後続と同じ強さ（FOR NO KEY UPDATE）で固定し、実際に競合させる。
        await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId} FOR NO KEY UPDATE`;
        markLocked();
        await sleep(holdMs);
        await tx.group.delete({ where: { id: groupId } });
      },
      { timeout: holdMs + 30000, maxWait: 10000 },
    );
    return { leader, locked };
  };

  /**
   * 削除側（v2-463）の対照。旧実装の形: `$transaction` に options を渡さず、固定の後に数え直して
   * 削除する。固定待ちが既定 5 秒に掛かると P2028（interactive transaction の timeout 超過。
   * PrismaExceptionFilter が 503 へ写す）になる。
   */
  const oldStyleDeleteUnreferenced = (groupId: number) =>
    prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE`;
      if (locked.length === 0) {
        return { missing: true, members: 0, audiences: 0 };
      }
      const members = await tx.userGroup.count({ where: { groupId } });
      const audiences = await tx.announcementRole.count({ where: { groupId } });
      if (members === 0 && audiences === 0) {
        await tx.group.delete({ where: { id: groupId } });
      }
      return { missing: false, members, audiences };
    });

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    // 同時 tx が pool 層ではなく行ロックで競合するよう connection_limit を上げる。
    prisma = new PrismaService({ datasourceUrl: `${db.databaseUrl}?connection_limit=10` });
    await prisma.$connect();
    repo = new GroupsRepository(prisma);
    usersRepo = new UsersRepository(prisma);
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await prisma.userGroup.deleteMany();
    await prisma.announcementRole.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
  });

  it('後続が行ロック待ちから戻った時は削除を投げず missing: true を返す（P2025 にしない）', async () => {
    const groupId = await createGroup(nextCode());

    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });

    const leader = holdThenDelete(groupId, markLocked, gate);
    await locked;

    const follower = deleteWhenFound(groupId);
    await sleep(200); // 後続がロック待ちへ入る窓を作る（どちらの順でも結果は同じ）
    releaseGate();
    await leader;

    await expect(follower).resolves.toEqual({ missing: true, members: 0, audiences: 0 });
    expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
  }, 60000);

  it('対照: 同じ手順を旧実装の形で走らせると P2025 が投げられる（競合を再現している）', async () => {
    const groupId = await createGroup(nextCode());

    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });

    const leader = holdThenDelete(groupId, markLocked, gate);
    await locked;

    const follower = oldStyleDelete(groupId);
    await sleep(200);
    releaseGate();
    await leader;

    await expect(follower).rejects.toMatchObject({ code: 'P2025' });
  }, 60000);

  it('所属ユーザーが残るグループは missing にならず members を返し、削除しない', async () => {
    const groupId = await createGroup(nextCode());
    const user = await prisma.user.create({
      data: { name: 'int-race', email: `int-race-${groupId}@test.local` },
    });
    await prisma.userGroup.create({ data: { groupId, userId: user.id } });

    await expect(deleteWhenFound(groupId)).resolves.toEqual({
      missing: false,
      members: 1,
      audiences: 0,
    });
    expect(await prisma.group.count({ where: { id: groupId } })).toBe(1);
  }, 60000);

  it('空のグループは削除し、missing は false のまま返る', async () => {
    const groupId = await createGroup(nextCode());

    await expect(deleteWhenFound(groupId)).resolves.toEqual({
      missing: false,
      members: 0,
      audiences: 0,
    });
    expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
  }, 60000);

  it('存在しないグループは missing: true を返す（逐次でも同じ）', async () => {
    await expect(deleteWhenFound(99999999)).resolves.toEqual({
      missing: true,
      members: 0,
      audiences: 0,
    });
  }, 60000);

  describe('削除と掲示宛先の追加の競合', () => {
    const deferred = () => {
      let resolve: () => void = () => {};
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };

    const createAudience = async (groupId: number) => {
      const creator = await prisma.user.create({
        data: { name: 'audience-race', email: `audience-${groupId}@test.local` },
      });
      return prisma.announcement.create({
        data: { title: 'private', bodyMarkdown: 'private', createdById: creator.id },
      });
    };

    /** 経過時間ではなく PostgreSQL が実際に検出した行ロック待機を見る。 */
    const waitForLock = async (pid: number, completed: () => boolean) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const [state] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT cardinality(pg_blocking_pids(${pid}::int)) > 0 AS blocked
        `;
        if (state.blocked) return true;
        if (completed()) return false;
        await sleep(20);
      }
      throw new Error('Expected PostgreSQL row lock wait was not observed');
    };

    it('宛先追加が先行した時は削除が固定待ちし、追加後の宛先数で掲示を保護する', async () => {
      const groupId = await createGroup(nextCode());
      const announcement = await createAudience(groupId);
      const inserted = deferred();
      const release = deferred();
      const insertion = prisma.$transaction(
        async (tx) => {
          await tx.announcementRole.create({ data: { announcementId: announcement.id, groupId } });
          inserted.resolve();
          await release.promise;
        },
        { timeout: 60000 },
      );
      await inserted.promise;
      let result: Awaited<ReturnType<typeof deleteWhenFound>> | undefined;
      const deletion = deleteWhenFound(groupId).then((value) => {
        result = value;
        return value;
      });
      try {
        // KEY SHARE の先行に対し SELECT 自体が待つ。DELETE まで通過する弱い固定と区別する。
        const deadline = Date.now() + 5000;
        let waitingSelect = false;
        while (!waitingSelect && Date.now() < deadline) {
          const [state] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
            SELECT EXISTS (SELECT 1 FROM pg_stat_activity
              WHERE cardinality(pg_blocking_pids(pid)) > 0
              AND query LIKE '%SELECT id, role, code, name FROM groups%') AS blocked
          `;
          waitingSelect = state.blocked;
          if (!waitingSelect) await sleep(20);
        }
        expect(waitingSelect).toBe(true);
        expect(result).toBeUndefined();
      } finally {
        release.resolve();
        await insertion;
        await deletion;
      }
      expect(result).toEqual({ missing: false, members: 0, audiences: 1 });
      expect(
        await prisma.announcementRole.count({ where: { announcementId: announcement.id } }),
      ).toBe(1);
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(1);
    }, 60000);

    const insertAfterCount = async (weakLock: boolean) => {
      const groupId = await createGroup(nextCode());
      const announcement = await createAudience(groupId);
      const counted = deferred();
      const release = deferred();
      // 実DBの count を完了した直後だけ停止し、検査と削除の間へ INSERT を確実に入れる。
      const extended = prisma.$extends({
        query: {
          announcementRole: {
            async count({ args, query }) {
              const count = await query(args);
              counted.resolve();
              await release.promise;
              return count;
            },
          },
        },
      });
      const deletion = weakLock
        ? extended.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId} FOR NO KEY UPDATE`;
              const members = await tx.userGroup.count({ where: { groupId } });
              const audiences = await tx.announcementRole.count({ where: { groupId } });
              if (members === 0 && audiences === 0)
                await tx.group.delete({ where: { id: groupId } });
            },
            { timeout: 60000 },
          )
        : new GroupsRepository(extended as unknown as PrismaService).deleteWithAuthorization(
            groupId,
            () => {},
          );
      await counted.promise;
      const started = deferred();
      let pid = 0;
      let completed = false;
      const insertion = prisma
        .$transaction(
          async (tx) => {
            const [connection] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            pid = connection.pid;
            started.resolve();
            await tx.announcementRole.create({
              data: { announcementId: announcement.id, groupId },
            });
          },
          { timeout: 60000 },
        )
        .then(
          () => {
            completed = true;
            return 'inserted';
          },
          (error: unknown) => {
            completed = true;
            return error;
          },
        );
      await started.promise;
      let blocked = false;
      try {
        blocked = await waitForLock(pid, () => completed);
      } finally {
        release.resolve();
        await deletion;
      }
      const insertionResult: unknown = await insertion;
      return {
        blocked,
        insertionResult,
        audiences: await prisma.announcementRole.count({
          where: { announcementId: announcement.id },
        }),
        announcements: await prisma.announcement.count({ where: { id: announcement.id } }),
      };
    };

    it('宛先数0の検査後の追加はFK固定で待ち、削除後に失敗する（宛先の消失を成功として返さない）', async () => {
      const result = await insertAfterCount(false);
      expect(result.blocked).toBe(true);
      expect(result.insertionResult).toMatchObject({ code: 'P2003' });
      expect(result.audiences).toBe(0);
      expect(result.announcements).toBe(1);
    }, 60000);

    it('対照: NO KEY UPDATE の旧形は検査後の宛先追加を通し、CASCADEで宛先を消失させる', async () => {
      const result = await insertAfterCount(true);
      expect(result.blocked).toBe(false);
      expect(result.insertionResult).toBe('inserted');
      expect(result.audiences).toBe(0);
      expect(result.announcements).toBe(1);
    }, 60000);
  });

  // ==========================================================================
  // v2-446: 更新（PUT）側の双子。削除側と同じく「固定の取得結果を在否の判定に使う」形にした。
  // ==========================================================================
  describe('グループ更新の行ロック競合 (v2-446)', () => {
    it('後続が行ロック待ちから戻った時は更新を投げず null を返す（P2025 にしない）', async () => {
      const groupId = await createGroup(nextCode());
      const { leader, locked, releaseGate } = startLeader(groupId);
      await locked;

      const follower = repo.updateIfPresent(groupId, { name: '後続の更新' });
      await sleep(200); // 後続がロック待ちへ入る窓を作る（どちらの順でも結果は同じ）
      releaseGate();
      await leader;

      await expect(follower).resolves.toBeNull();
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
    }, 60000);

    it('対照: 同じ手順を旧実装の形で走らせると P2025 が投げられる（競合を再現している）', async () => {
      const groupId = await createGroup(nextCode());
      const { leader, locked, releaseGate } = startLeader(groupId);
      await locked;

      const follower = oldStyleUpdate(groupId, { name: '旧実装の更新' });
      await sleep(200);
      releaseGate();
      await leader;

      await expect(follower).rejects.toMatchObject({ code: 'P2025' });
    }, 60000);

    it('本文が空（{}）でも既存行は null にならず行を返す（count 判定へ戻すと赤くなる）', async () => {
      const groupId = await createGroup(nextCode());

      await expect(repo.updateIfPresent(groupId, {})).resolves.toMatchObject({ id: groupId });
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(1);
    }, 60000);

    it('存在しないグループは null を返す（逐次でも同じ）', async () => {
      await expect(repo.updateIfPresent(99999999, { name: 'x' })).resolves.toBeNull();
    }, 60000);

    it('競合しない更新は行を返し、値が反映される（通常の更新は不変）', async () => {
      const groupId = await createGroup(nextCode());

      const updated = await repo.updateIfPresent(groupId, { name: '通常の更新' });

      expect(updated).toMatchObject({ id: groupId, name: '通常の更新' });
      expect((await prisma.group.findUnique({ where: { id: groupId } }))?.name).toBe('通常の更新');
    }, 60000);

    it('code 重複は P2002 のまま投げられる（409 への写像を変えない）', async () => {
      const first = await createGroup(nextCode());
      const secondCode = nextCode();
      await createGroup(secondCode);

      await expect(repo.updateIfPresent(first, { code: secondCode })).rejects.toMatchObject({
        code: 'P2002',
      });
    }, 60000);

    // 独立レビュー F-1（HIGH）: `$transaction` に timeout を明示しないと Prisma の既定 5 秒に掛かり、
    // ロック待ちが 5 秒を超えた時に P2028（→ 503）になる。旧実装（autocommit の単文 update）は
    // 同じ保持でも P2025（→ 404）だったため、それでは「同じ『行が無い』状態に応答が2通りできる」
    // という本票の欠陥が 404 と 503 の形で残る。ここで 5 秒超の保持を固定する（timeout を外すと赤）。
    it('行ロック待ちが 5 秒を超えても null を返す（P2028 / 503 にしない。timeout を外すと赤）', async () => {
      const groupId = await createGroup(nextCode());
      const { leader, locked } = startLeaderWithHold(groupId, 6500);
      await locked;

      const startedAt = Date.now();
      const result = await repo.updateIfPresent(groupId, { name: '5秒超の後続' });
      const elapsed = Date.now() - startedAt;
      await leader;

      expect(result).toBeNull();
      expect(elapsed).toBeGreaterThan(5000); // 本当に既定の 5 秒を超えて待ったことの実測
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
    }, 60000);

    // 独立レビュー F-2（MEDIUM）: 素の `FOR UPDATE` は外部キー検査の `FOR KEY SHARE` とも衝突するため、
    // 同じグループへの所属追加（user_groups への INSERT）と更新が互いを待たされる。旧実装の
    // `group.update` が取る `FOR NO KEY UPDATE` に揃えることで、競合の検出能力を落とさずに波及を消す。
    //
    // 固定の仕方: 所属追加（外部キー検査で `FOR KEY SHARE` を取る）を開いたままにし、その間に
    // `updateIfPresent` を呼ぶ。`FOR NO KEY UPDATE` なら待たずに通る。`FOR UPDATE` へ戻すと
    // 所属追加の commit まで待たされて赤くなる（別接続で競合させるため、先行は別の仕組みで走らせる）。
    it('所属追加の最中でも更新が待たされない（FOR NO KEY UPDATE。FOR UPDATE へ戻すと赤）', async () => {
      const groupId = await createGroup(nextCode());
      const user = await prisma.user.create({
        data: { name: 'int-upd-lock', email: `int-upd-lock-${groupId}@test.local` },
      });

      let releaseGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      let markInserted: () => void = () => {};
      const inserted = new Promise<void>((resolve) => {
        markInserted = resolve;
      });

      // 先行: 所属追加を open transaction のまま保持し、グループ行に FOR KEY SHARE を取らせる。
      const leader = prisma.$transaction(
        async (tx) => {
          await tx.userGroup.create({ data: { groupId, userId: user.id } });
          markInserted();
          await gate;
        },
        { timeout: 60000, maxWait: 10000 },
      );
      await inserted;

      const startedAt = Date.now();
      const updated = await repo.updateIfPresent(groupId, { name: '所属追加と同時の更新' });
      const elapsed = Date.now() - startedAt;

      releaseGate();
      await leader;

      expect(updated).toMatchObject({ id: groupId, name: '所属追加と同時の更新' });
      // 素の FOR UPDATE だと所属追加の commit 待ち（実測 1.5 秒級）になるため、待っていないことを見る。
      expect(elapsed).toBeLessThan(1000);
    }, 60000);
  });

  // ==========================================================================
  // v2-463: 削除側（`deleteIfUnreferenced`）の timeout を更新側（v2-446）と揃える。
  // 既定 5 秒に掛かると、5 秒超のロック待ちが P2028（→ 503）になり、逐次で再送した時の
  // 404 に対して退行する。updateIfPresent と同じく timeout を明示して 404 相当へ到達させる。
  // ==========================================================================
  describe('グループ削除の timeout (v2-463)', () => {
    // 独立レビュー R2-4（LOW）: `deleteIfUnreferenced` は `$transaction` に options を渡して
    // いなかった。7 秒保持で P2028 → 503、4 秒保持なら `{ missing: true }`（→ 404 相当）。
    it('行ロック待ちが 5 秒を超えても missing: true を返す（P2028 / 503 にしない。timeout を外すと赤）', async () => {
      const groupId = await createGroup(nextCode());
      const { leader, locked } = startLeaderWithHold(groupId, 6500);
      await locked;

      const startedAt = Date.now();
      const result = await deleteWhenFound(groupId);
      const elapsed = Date.now() - startedAt;
      await leader;

      expect(result).toEqual({ missing: true, members: 0, audiences: 0 });
      expect(elapsed).toBeGreaterThan(5000); // 本当に既定の 5 秒を超えて待ったことの実測
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
    }, 60000);

    // 対照: この手順が本当に既定 5 秒の崖を踏んでいることの証明。options を渡さない旧形は、
    // 同じ保持で P2028（interactive transaction の timeout 超過）を投げる。
    // これが赤くならなければ、上の it は「競合していない緑」であり得る。
    it('対照: 同じ手順を timeout 無しの旧形で走らせると P2028 が投げられる（崖を再現している）', async () => {
      const groupId = await createGroup(nextCode());
      const { leader, locked } = startLeaderWithHold(groupId, 6500);
      await locked;

      const follower = oldStyleDeleteUnreferenced(groupId);
      await expect(follower).rejects.toMatchObject({ code: 'P2028' });
      await leader;
    }, 60000);
  });

  // ==========================================================================
  // v2-532: 削除の認可を「固定した最新行」でやり直す（利用者・グループの両方）。
  //
  // 事前読取 → 素の delete の旧形では、事前読取の後に SYS_ADMIN が同じ行を最上位ロールへ
  // 昇格させて commit すると、昇格前の `role` で認可したまま保護対象を削除できた。
  // `deleteWithAuthorization` は固定した行の `role` で認可し直す。対照（旧形）は同じ手順で
  // 削除が通ることを確かめ、この検査が空振りでないことを示す。
  // ==========================================================================
  describe('削除の認可と昇格の競合 (v2-532)', () => {
    /** グループ行を固定したまま昇格させ、`gate` が解決するまで commit しない先行。 */
    const holdThenPromoteGroup = (groupId: number, onLocked: () => void, gate: Promise<void>) =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId} FOR NO KEY UPDATE`;
          onLocked();
          await gate;
          await tx.group.update({ where: { id: groupId }, data: { role: UserRole.SYS_ADMIN } });
        },
        { timeout: 60000, maxWait: 10000 },
      );

    /** 利用者行を固定したまま昇格させ、`gate` が解決するまで commit しない先行。 */
    const holdThenPromoteUser = (userId: string, onLocked: () => void, gate: Promise<void>) =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
          onLocked();
          await gate;
          await tx.user.update({ where: { id: userId }, data: { role: UserRole.SYS_ADMIN } });
        },
        { timeout: 60000, maxWait: 10000 },
      );

    /**
     * 事前読取の後に行ロック待ちへ入る後続を作る（後続が先に固定を取らないよう少し待つ）。
     * 先行の結果は `follower` の成否に関わらず待つ（後続が拒否で止まっても commit を妨げない）。
     */
    const withLockedThenRelease = async (
      hold: (onLocked: () => void, gate: Promise<void>) => Promise<unknown>,
      follower: () => Promise<unknown>,
    ) => {
      let releaseGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      let markLocked: () => void = () => {};
      const locked = new Promise<void>((resolve) => {
        markLocked = resolve;
      });

      const leader = hold(markLocked, gate);
      await locked;

      // 非同期の後続そのものを返す（直ちに release すると先行が固定を取る前に後続が通り得る）。
      const followerPromise = Promise.resolve().then(follower);
      // 後続が固定待ちへ入る窓を空ける。正しい実装は固定待ちから戻って最新行を見る。
      await sleep(200);
      releaseGate();
      await leader;
      return followerPromise;
    };

    it('グループ: 事前読取の後に SYS_ADMIN へ昇格していれば、非 SYS_ADMIN の削除を拒否し行を残す', async () => {
      const groupId = await createGroup(nextCode());
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.WH_ADMIN } });

      const follower = withLockedThenRelease(
        (onLocked, gate) => holdThenPromoteGroup(groupId, onLocked, gate),
        () =>
          repo.deleteWithAuthorization(groupId, (current) => {
            if (current.role === UserRole.SYS_ADMIN) {
              throw new ForbiddenException(
                'システム管理者グループの削除はシステム管理者のみ実行できます',
              );
            }
          }),
      );

      // 拒否は Repository で握られず、そのまま呼び出し元へ伝わる。
      await expect(follower).rejects.toThrow(ForbiddenException);
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(1);
      expect((await prisma.group.findUnique({ where: { id: groupId } }))?.role).toBe(
        UserRole.SYS_ADMIN,
      );
    }, 60000);

    it('グループ: 実サービス（事前読取→固定→認可→削除）でも、昇格と重なった削除は 403 で行を残す', async () => {
      const groupId = await createGroup(nextCode());
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.WH_ADMIN } });

      const repoForService = new GroupsRepository(prisma);
      const originalFindById = repoForService.findById.bind(repoForService);
      repoForService.findById = async (id: number) => {
        const group = await originalFindById(id);
        // 事前読みの直後（＝固定の前）に、対象を SYS_ADMIN へ昇格させて commit する。
        await prisma.group.update({ where: { id }, data: { role: UserRole.SYS_ADMIN } });
        return group;
      };
      const service = new GroupsService(repoForService, usersRepo);

      await expect(service.remove(groupId, UserRole.WH_ADMIN)).rejects.toThrow(ForbiddenException);
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(1);
    }, 60000);

    it('対照: グループを旧形（固定せず素の delete）で同じ手順に通すと削除できる（穴の再現）', async () => {
      const groupId = await createGroup(nextCode());
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.WH_ADMIN } });

      const follower = withLockedThenRelease(
        (onLocked, gate) => holdThenPromoteGroup(groupId, onLocked, gate),
        () => prisma.group.delete({ where: { id: groupId } }),
      );

      await expect(follower).resolves.toBeDefined();
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);
    }, 60000);

    it('利用者: 事前読取の後に SYS_ADMIN へ昇格していれば、非 SYS_ADMIN の削除を拒否し行を残す', async () => {
      const user = await prisma.user.create({
        data: { name: 'int-promote', email: `int-promote-${++seq}@test.local` },
      });
      await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.WH_ADMIN } });

      const follower = withLockedThenRelease(
        (onLocked, gate) => holdThenPromoteUser(user.id, onLocked, gate),
        () =>
          usersRepo.deleteWithAuthorization(user.id, (current) => {
            if (current.role === UserRole.SYS_ADMIN) {
              throw new ForbiddenException('システム管理者アカウントは削除できません');
            }
          }),
      );

      await expect(follower).rejects.toThrow(ForbiddenException);
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.role).toBe(
        UserRole.SYS_ADMIN,
      );
    }, 60000);

    it('対照: 利用者を旧形（固定せず素の delete）で同じ手順に通すと削除できる（穴の再現）', async () => {
      const user = await prisma.user.create({
        data: { name: 'int-promote-old', email: `int-promote-old-${++seq}@test.local` },
      });
      await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.WH_ADMIN } });

      const follower = withLockedThenRelease(
        (onLocked, gate) => holdThenPromoteUser(user.id, onLocked, gate),
        () => prisma.user.delete({ where: { id: user.id } }),
      );

      await expect(follower).resolves.toBeDefined();
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    }, 60000);

    it('保護されていない行は固定した行でも削除でき、行が無ければ missing を返す', async () => {
      const groupId = await createGroup(nextCode());
      await prisma.group.update({ where: { id: groupId }, data: { role: UserRole.WH_ADMIN } });

      await expect(
        repo.deleteWithAuthorization(groupId, (current) => {
          if (current.role === UserRole.SYS_ADMIN) throw new ForbiddenException('denied');
        }),
      ).resolves.toEqual({ missing: false, members: 0, audiences: 0 });
      expect(await prisma.group.count({ where: { id: groupId } })).toBe(0);

      await expect(
        usersRepo.deleteWithAuthorization('00000000-0000-0000-0000-000000000000', () => {}),
      ).resolves.toEqual({ outcome: 'missing' });
    }, 60000);
  });
});
