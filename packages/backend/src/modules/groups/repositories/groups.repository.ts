import { Injectable } from '@nestjs/common';
import { Group, Prisma, UserGroup, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginatedList, exportList, ListConfig, ListQueryParams } from '../../../common/services';
import {
  GroupResponseDto,
  GroupMemberResponseDto,
  GroupWithMembersResponseDto,
} from '../dto/group-response.dto';
import {
  toGroupResponse,
  toGroupMemberResponse,
  toGroupWithMembersResponse,
  GroupPayload,
  GroupMemberPayload,
  GroupWithMembersPayload,
} from '../groups.mapper';

/** `deleteIfUnreferenced` の結果。`missing` は「行が既に無い」（同時削除の後続・存在確認の後に消えた）。 */
export interface DeleteIfUnreferencedResult {
  missing: boolean;
  members: number;
  audiences: number;
}

/** 認可に使う利用者行の最小形（`role` だけが認可の入力）。 */
export interface UserRowSnapshot {
  id: string;
  role: UserRole | null;
}

/**
 * 認可付きの書込み（v2-485）で Repository から Service へ渡す「固定時点の最新行」。
 *
 * Service はこの値だけで認可を判定する。`findById` などで事前に読んだ値は渡さない
 * （渡すと、事前読みと書込みの間に別トランザクションが系統を変えた時に、古い系統で
 * 認可したまま書き込む穴が戻る）。
 */
export interface GroupRowSnapshot {
  id: number;
  role: UserRole;
  code: string;
  name: string;
}

/** `writeMembershipWithAuthorization` が固定した時点の最新行。 */
export interface MembershipSnapshot {
  /** グループ行。ロック取得時に不在なら `null`（呼び出し元は既存の 404 を返す）。 */
  group: GroupRowSnapshot | null;
  /** 対象利用者行。ロック取得時に不在なら `null`（呼び出し元は既存の 404 を返す）。 */
  user: UserRowSnapshot | null;
  /** 所属行が既に在るか。`user` / `group` が `null` の時は `false`。 */
  memberExists: boolean;
}

/** `writeMembershipWithAuthorization` の結果。 */
export interface MembershipWriteResult<T> {
  group: GroupRowSnapshot | null;
  user: UserRowSnapshot | null;
  value: T | null;
}

@Injectable()
export class GroupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyPaginated(query: ListQueryParams, config: ListConfig) {
    return paginatedList<Group, GroupResponseDto>(
      this.prisma.group,
      query,
      config,
      toGroupResponse,
    );
  }

  findManyForExport(query: ListQueryParams, config: ListConfig) {
    return exportList<Group, GroupResponseDto>(this.prisma.group, query, config, toGroupResponse);
  }

  /** 内部存在確認用 — Entity のまま保持 */
  findById(id: number): Promise<Group | null> {
    return this.prisma.group.findUnique({ where: { id } });
  }

  async findByIdWithMembers(id: number): Promise<GroupWithMembersResponseDto | null> {
    const group = (await this.prisma.group.findUnique({
      where: { id },
      include: {
        userGroups: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    })) as GroupWithMembersPayload | null;

    return group ? toGroupWithMembersResponse(group) : null;
  }

  /** 内部コード重複チェック用 — Entity のまま保持 */
  findByCode(code: string): Promise<Group | null> {
    return this.prisma.group.findUnique({ where: { code } });
  }

  async create(data: Prisma.GroupCreateInput): Promise<GroupResponseDto> {
    const group = (await this.prisma.group.create({ data })) as GroupPayload;
    return toGroupResponse(group);
  }

  /**
   * 行がまだ在る時だけ更新する（v2-446）。
   *
   * `PUT /api/v1/groups/:id` は `findById` で存在を確かめた後に `group.update` を投げるため、
   * 確認と更新の間に別トランザクションが同じ行を削除して commit すると、`group.update` が
   * P2025（No record was found for an update）を投げる。逐次（存在しない id への PUT）は service の
   * `findById` 検査から `404 Group not found` になるのに、競合した時だけ Prisma の例外フィルタの
   * 汎用文言（`対象のレコードが見つかりません`）になり、同じ「行が無い」状態に応答が2通りできる。
   *
   * `deleteIfUnreferenced`（v2-428）と同じく、固定の取得そのものを「行がまだ在るか」の判定に使う。
   * 固定が 0 行なら更新を投げずに `null` を返す。ロック待ちから戻った後続は READ COMMITTED の
   * 再評価で 0 行になり、先行の削除が commit 済みでも P2025 の余地が残らない。固定を取った後は
   * commit まで行ロックを保持するため、`update` までの間に同じ行を他のトランザクションが消せない。
   *
   * **固定は `FOR NO KEY UPDATE` にする。** 不在判定に必要なのは「DELETE と衝突すること」だけで、
   * 素の `FOR UPDATE` はそれに加えて `FOR KEY SHARE` とも衝突する。`user_groups` /
   * `announcement_roles` への INSERT は外部キー検査で `FOR KEY SHARE` を取るため、素の `FOR UPDATE`
   * だと**同じグループへの所属追加や掲示の宛先追加が更新の commit まで待たされる**（実測: v2-446。
   * `FOR UPDATE` は 1511ms 待機、`FOR NO KEY UPDATE` は 2ms で通過）。`FOR NO KEY UPDATE` でも
   * 同時 DELETE は 1515ms 待って 0 行を見る（不在判定は成立する）。旧実装の `group.update` が
   * 取るロックと同じ強さでもある。
   *
   * **`$transaction` に明示の timeout を渡す。** 既定は 5 秒で、待っている間にトランザクションが
   * 失効すると P2028 になり、例外フィルタが 503 へ写す。旧実装の `group.update` は autocommit の
   * 単文でこの上限が無く、同じ保持でも P2025 → 404 だった。**明示しないと、この変更が消そうとした
   * 「同じ『行が無い』状態に応答が2通りできる」欠陥が 404 と 503 の形で残る**（実測: v2-446。
   * 7 秒保持で 旧形 P2025 / 既定 timeout の新形 P2028、明示 timeout なら 0 行を見て `null`）。
   * 値は `products.repository.ts` の一括取込（最大 1 万行を 1 トランザクションで処理）と同じ
   * `{ timeout: 60_000, maxWait: 10_000 }` に揃える。ロック待ちが 60 秒を超える場合は P2028 →
   * 503 のまま残るが、これは再送で解ける一時的な状態で、旧実装でも同じ 60 秒級の待ちは
   * クライアント側の timeout に掛かる（境界は ADR 0029 の既知の不完全さに記録した）。
   *
   * **`updateMany` の `count` で不在を判定する形は採らない。** `data` が空（`{}`）の時、既存行でも
   * `count` は 0 になり（実測: v2-446）、行が無い場合と同じ値になる。`UpdateGroupDto` は全項目が
   * 任意なので空ボディの PUT が通り、その時に偽の 404 を作る（`update` は空 `data` でも行を返す）。
   *
   * P2025 は解釈しない。不在はロック取得の結果が持ち、Prisma エラーはそのまま再スローして
   * PrismaExceptionFilter に委譲する既存規約（categories / suppliers の service spec）を維持する。
   */
  updateIfPresent(id: number, data: Prisma.GroupUpdateInput): Promise<GroupResponseDto | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: number }>
        >`SELECT id FROM groups WHERE id = ${id} FOR NO KEY UPDATE`;
        if (locked.length === 0) {
          return null;
        }
        const group = (await tx.group.update({ where: { id }, data })) as GroupPayload;
        return toGroupResponse(group);
      },
      // 行ロック待ちが既定の 5 秒を超えても P2028（→503）にしない（上の doc を参照）。
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  /** 削除後破棄 — Entity のまま保持 */
  delete(id: number): Promise<Group> {
    return this.prisma.group.delete({ where: { id } });
  }

  /**
   * 依存（所属ユーザー・掲示の宛先）を数え直し、どちらも無い時だけ削除する（v2-412）。
   *
   * announcement_roles.group_id は ON DELETE CASCADE のため、宛先グループを削除すると宛先の行が
   * 消え、宛先が空になった掲示は「全員可視」へ降格する（announcements.service の可視性判定と
   * 一覧の roles: { none: {} } がそう扱う）。数えた後に宛先が増える競合を閉じるため、次の順で
   * 同一トランザクションに束ねる。
   *
   *   1. 対象グループ行を FOR UPDATE で固定する。announcement_roles への INSERT は外部キー検査で
   *      参照先行への FOR KEY SHARE を取るため、この固定と衝突して待たされる。
   *   2. 固定を取った後に数え直す（1 の待ちが解けた後なら、先に commit された宛先も見える）。
   *   3. どちらも 0 件の時だけ削除する。
   *
   * **固定の取得そのものを「行がまだ在るか」の判定に使う。** 同時削除の後続は 1 で待たされ、
   * 先行が commit した後に評価し直されて 0 行になる（READ COMMITTED の FOR UPDATE の再評価）。
   * その時は削除を投げずに `missing: true` を返す（投げると P2025 が 500 になっていた。v2-428）。
   * 固定を取れた後に他のトランザクションが同じ行を消すことはない（commit まで行ロックを保持する）。
   *
   * 数えた結果と行の有無は呼び出し元（404 / 拒否理由の出し分け）へ返す。
   *
   * **`$transaction` に明示の timeout を渡す（v2-463）。** 既定は 5 秒で、固定待ちの間に
   * トランザクションが失効すると P2028 になり、例外フィルタが 503 へ写す。逐次（存在しない id）
   * は service の `findById` 検査から `404 Group not found` になるため、明示しないと
   * **同じ「行が無い」状態に 404 と 503 の応答が2通りできる**（実測: v2-463。7 秒保持で
   * 既定 timeout は P2028、明示 timeout なら 0 行を見て `missing: true`）。
   * 値は更新側の `updateIfPresent`（v2-446）と同じ `{ timeout: 60_000, maxWait: 10_000 }` に
   * 揃える。待ち時間の主因は数え直しの2クエリの長さではなく固定の保持時間で、同じ行に対する
   * update と delete で崖の位置が2通りにならないようにする（出典は `products.repository.ts`
   * の一括取込と ADR 0029）。ロック待ちが 60 秒を超える場合は P2028 → 503 のまま残るが、
   * 再送で解ける一時的な状態である（ADR 0029 の既知の不完全さ）。
   */
  deleteIfUnreferenced(id: number): Promise<DeleteIfUnreferencedResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: number }>
        >`SELECT id FROM groups WHERE id = ${id} FOR UPDATE`;
        if (locked.length === 0) {
          return { missing: true, members: 0, audiences: 0 };
        }
        const members = await tx.userGroup.count({ where: { groupId: id } });
        const audiences = await tx.announcementRole.count({ where: { groupId: id } });
        if (members === 0 && audiences === 0) {
          await tx.group.delete({ where: { id } });
        }
        return { missing: false, members, audiences };
      },
      // 行ロック待ちが既定の 5 秒を超えても P2028（→503）にしない（上の doc を参照、v2-463）。
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  /**
   * 最新行を固定して認可し、通った時だけ同じトランザクションで更新する（v2-485）。
   *
   * `updateIfPresent`（v2-446）と同じく固定の取得を在否の判定に使うが、**認可の入力も
   * 固定した行から取る**。旧実装は `service.update` が `findById` で読んだ `role` で
   * 系統の検査を通し、その後で `updateIfPresent(id, dto)` を呼んでいた。固定するのが `id`
   * だけで `role` を読み直さないため、**認可と書込みの間に別トランザクションが `Group.role`
   * を書き換えて commit すると、書き換え前の系統で認可したまま更新が通る**（実測: v2-485。
   * WH_ADMIN が編成できる WH 系統のグループを、SYS_ADMIN が同時に OF_USER へ変えると、
   * 待機していた更新が OF 系統の `name` を書き換えられた）。
   *
   * 順序は「固定 → 認可 → 更新」に固定する。`authorize` は Service が渡す純粋な判定で、
   * 固定した行だけを受け取る（Prisma もトランザクションも渡さない）。Service は既存の判定関数が
   * 投げる `ForbiddenException` をそのまま投げ、それはこのトランザクションを素通りして
   * rollback させる（拒否された更新が残る余地は無い）。Repository は拒否の種類を解釈しない。
   *
   * 固定は `FOR NO KEY UPDATE`（v2-446 の実測を維持）。`authorize` が投げる例外は
   * ここで握らずにそのまま通す（P2025 を解釈しない既存の規約と同じ）。
   */
  updateWithAuthorization(
    id: number,
    data: Prisma.GroupUpdateInput,
    authorize: (group: GroupRowSnapshot) => void,
  ): Promise<GroupResponseDto | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<GroupRowSnapshot[]>`
          SELECT id, role, code, name FROM groups WHERE id = ${id} FOR NO KEY UPDATE
        `;
        if (locked.length === 0) {
          return null;
        }
        authorize(locked[0]);
        const group = (await tx.group.update({ where: { id }, data })) as GroupPayload;
        return toGroupResponse(group);
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  /**
   * 所属の追加・削除を、グループと対象利用者の最新行を固定した上で認可してから書く（v2-485）。
   *
   * 旧実装は `service.addMember` が `findById` / `usersRepo.findById` で読んだ**事前の**
   * `Group.role` / `User.role` で SYS_ADMIN 領域と編成の範囲を判定し、`findMember` の後に
   * 無条件で `create` していた。`removeMember` も同じ形で、事前に読んだ2行で判定してから
   * 無条件で `delete` していた。いずれも**判定と書込みの間に系統が変わると、変更後の担当外
   * 操作が通る**（実測: v2-485。WH_ADMIN の追加が `findMember` の後で待機し、その間に
   * SYS_ADMIN がグループを OF_USER へ変えて commit すると、OF 系統のグループへ追加できた）。
   *
   * **ロックは `group` → `user` → `membership` の順で取る。** この順序は既存コードの
   * どこにも逆順が無いことを実測して選んでいる（`users.service` の更新はグループ行を
   * 触らず、`users.repository.update` は autocommit の単文なので、利用者 → グループの
   * 取得順は存在しない）。逆順の経路を後から足すと deadlock し得るので、順序はここに固定する。
   *
   * **`group` と `user` は `FOR NO KEY UPDATE` で固定する。`FOR SHARE` では足りない。**
   *
   * PostgreSQL 16 の実測（保持側 = 先行トランザクション、後続 = このメソッドと同じことをする
   * `SELECT ... <lock>`、系统変更 = 素の `UPDATE ... SET role`）:
   *
   *   - 保持 `FOR SHARE` / 後続 `FOR SHARE` → 後続は**待たず**、**変更前の role を読む**（穴が残る）
   *   - 保持 `FOR SHARE` / 後続 `FOR NO KEY UPDATE` → 後続は待ち、**変更後の role を読む**
   *   - 保持 `FOR NO KEY UPDATE` / 後続 `FOR SHARE` → 後続は待ち、変更後の role を読む
   *
   * `FOR SHARE` は **自分自身とは衝突しない**ため、系統変更が「これから」ロックを取る状況では
   * 後続が先に `FOR SHARE` を取れてしまい、**変更前の role で認可したまま書く**経路が残る
   * （実測: 保持を `FOR SHARE` にした版で、OF 系統へ変わる直前の WH 系統の role を読んで
   * 追加が成功した）。`Group.role` / `User.role` の UPDATE が取るのと同じ強さ
   * （`FOR NO KEY UPDATE`）で待つことで、変更が commit してから読み直す。
   *
   * **`FOR NO KEY UPDATE` でも `user_groups` の INSERT は待たされない。** 外部キー検査が親行に
   * 取る `FOR KEY SHARE` と `FOR NO KEY UPDATE` は衝突しない（実測: 子 INSERT の待ち 602ms ＝
   * 保持なしと同じ。素の `FOR UPDATE` だけが 608ms 待つ）。v2-446 が更新側で避けた「所属追加の
   * 不要な直列化」は、`FOR UPDATE` を選ばない限り起きない。
   *
   * **利用者行でも同じ強さを使う。** 利用者の `role` 変更は `users.repository.update` の素の
   * `prisma.user.update`（autocommit の単文）で**明示のロックを取らない**が、文が
   * `FOR NO KEY UPDATE` を取るため、こちらが `FOR NO KEY UPDATE` で待てば衝突する。
   * `FOR KEY SHARE` へ弱めると**この検査が静かに無効になる**（実測: 保持 `FOR KEY SHARE` では
   * 系統変更が 243ms で素通りする）。
   *
   * なお `deleteIfUnreferenced` は同じグループ行に素の `FOR UPDATE` を取るため衝突するが、
   * 両者ともグループ行を先に取るので deadlock にはならず直列化するだけである。
   *
   * 不在は固定の取得結果が持つ（`group` / `user` が `null`）。呼び出し元は既存の 404 を返し、
   * ロック待ちから戻って行が消えていた場合も同じ応答になる。`snapshot` は固定した行だけを
   * 受け取り、拒否は Service が投げる例外がそのままトランザクションを rollback させる。
   * 所属の重複は `memberExists` として渡し、呼び出し元が既存の 409 を返す。
   */
  async writeMembershipWithAuthorization<T>(
    groupId: number,
    userId: string,
    mode: 'add' | 'remove',
    snapshot: (current: MembershipSnapshot) => void,
    write: (tx: Prisma.TransactionClient, current: MembershipSnapshot) => Promise<T>,
  ): Promise<MembershipWriteResult<T>> {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. グループ行を固定する（系統の変更＝FOR NO KEY UPDATE と衝突させる）。
        const groups = await tx.$queryRaw<GroupRowSnapshot[]>`
          SELECT id, role, code, name FROM groups WHERE id = ${groupId} FOR NO KEY UPDATE
        `;
        if (groups.length === 0) {
          return { group: null, user: null, value: null };
        }

        // 2. 対象利用者行を固定する（利用者の系統変更＝FOR NO KEY UPDATE と衝突させる）。
        //    グループ行と同じ強さにする（`FOR SHARE` へ弱めると、系統変更がこれからロックを
        //    取る状況で後続が先回りして変更前の role を読む穴が戻る。上の doc を参照）。
        //
        //    比較は `id = ${userId}`（キャストを書かない）。`users.id` は **`text` 型**
        //    （`schema.prisma` は `id String @id @default(uuid())` で `@db.Uuid` を付けていない。
        //    実測: `information_schema.columns` の data_type は `text`）。埋め込み値も text として
        //    束縛されるため両辺が text で揃い、そのまま比較できる。
        //
        //    `= ${userId}::uuid` と書くと右辺だけ uuid になり、列は text のままなので
        //    `operator does not exist: text = uuid`（42883）で落ちる（実測）。列の型に合わせて
        //    キャストを足すのではなく、**足さないことが正しい**（`id::text` のような列側の
        //    キャストも、text 同士の比較になるだけで要らない）。
        const users = await tx.$queryRaw<UserRowSnapshot[]>`
          SELECT id, role FROM users WHERE id = ${userId} FOR NO KEY UPDATE
        `;
        if (users.length === 0) {
          return { group: groups[0], user: null, value: null };
        }

        // 3. 所属行を読む。追加どうしの競合は unique 制約が受け止める（P2002 → 既存の 409）。
        const member = await tx.userGroup.findUnique({
          where: { userId_groupId: { userId, groupId } },
        });
        const current: MembershipSnapshot = {
          group: groups[0],
          user: users[0],
          memberExists: member !== null,
        };

        if (mode === 'add' && current.memberExists) {
          // 既存所属の追加。書込みは投げず、呼び出し元が既存の 409 を返す。
          return { group: current.group, user: current.user, value: null };
        }
        if (mode === 'remove' && !current.memberExists) {
          return { group: current.group, user: current.user, value: null };
        }

        snapshot(current);
        const value = await write(tx, current);
        return { group: current.group, user: current.user, value };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  /** boolean 判定用 — Entity のまま保持 */
  findMember(groupId: number, userId: string): Promise<UserGroup | null> {
    return this.prisma.userGroup.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
  }

  async findMembers(groupId: number): Promise<GroupMemberResponseDto[]> {
    const members = (await this.prisma.userGroup.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    })) as GroupMemberPayload[];

    return members.map(toGroupMemberResponse);
  }

  async addMember(groupId: number, userId: string): Promise<GroupMemberResponseDto> {
    const userGroup = (await this.prisma.userGroup.create({
      data: { userId, groupId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    })) as GroupMemberPayload;

    return toGroupMemberResponse(userGroup);
  }

  /** 削除後破棄 — Entity のまま保持 */
  removeMember(groupId: number, userId: string): Promise<UserGroup> {
    return this.prisma.userGroup.delete({
      where: { userId_groupId: { userId, groupId } },
    });
  }
}
