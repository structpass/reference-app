import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ListConfig } from '../../common/services';
import { ok, okMessage } from '../../common/dto';
import {
  GroupsRepository,
  GroupRowSnapshot,
  UserRowSnapshot,
} from './repositories/groups.repository';
import { GroupMemberPayload, toGroupMemberResponse } from './groups.mapper';
import { UsersRepository } from '../users/repositories/users.repository';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { FindGroupsDto } from './dto/find-groups.dto';
import {
  canOrganizeGroup,
  canChangeGroupRole,
  canCreateGroupOfRole,
  groupScopeDenialMessage,
  groupRoleChangeDenialMessage,
  groupCreateDenialMessage,
} from './constants/group-membership-scope';

const LIST_CONFIG: ListConfig = {
  searchFields: ['name', 'code'],
  allowedSortFields: ['createdAt', 'updatedAt', 'name', 'code', 'status'],
  paginatedInclude: { _count: { select: { userGroups: true } } },
};

@Injectable()
export class GroupsService {
  constructor(
    private readonly repo: GroupsRepository,
    private readonly usersRepo: UsersRepository,
  ) {}

  async findAll(query: FindGroupsDto) {
    return this.repo.findManyPaginated(query, LIST_CONFIG);
  }

  async findAllForExport(query: FindGroupsDto) {
    return this.repo.findManyForExport(query, LIST_CONFIG);
  }

  async findOne(id: number) {
    const group = await this.repo.findByIdWithMembers(id);

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return ok(group);
  }

  async create(dto: CreateGroupDto, callerRole: UserRole | null) {
    this.assertSysAdminArea(
      callerRole,
      [dto.role],
      'システム管理者グループの作成はシステム管理者のみ実行できます',
    );

    // 作成経路でも系統を偽装できないようにする（v2-425 / 独立レビュー F-4）。更新経路の
    // canChangeGroupRole と同じ構造の穴で、これが無いと WH_ADMIN が role=OF_USER で作成し、
    // 作った本人が編成できないグループを相手系統の管理者が編成できる状態になる。
    // コード重複の検査より前に置く（後に置くと、担当外の系統でも既存コードの有無が 409 で分かる。
    // v2-425 / 独立レビュー F-7）。
    if (!canCreateGroupOfRole(callerRole, dto.role)) {
      throw new ForbiddenException(groupCreateDenialMessage(dto.role));
    }

    const existing = await this.repo.findByCode(dto.code);

    if (existing) {
      throw new ConflictException(`Group with code ${dto.code} already exists`);
    }

    const group = await this.repo.create(dto);

    return ok(group);
  }

  async update(id: number, dto: UpdateGroupDto, callerRole: UserRole | null) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Group not found');
    }

    this.assertSysAdminArea(
      callerRole,
      [existing.role, dto.role],
      'システム管理者グループの変更はシステム管理者のみ実行できます',
    );

    // 編集はそのグループを編成できる側に閉じる（v2-425 / 独立レビュー F-6）。role の付け替えだけを
    // 見ていると、系統をまたいで code や status を書き換えられる（実測: WH_ADMIN が OF 系統の
    // グループを INACTIVE にできる）。作成・編成と同じ基準に揃え、境界を「そのグループを扱えるか」
    // の1つにする。
    if (!canOrganizeGroup(callerRole, existing.role)) {
      throw new ForbiddenException(groupScopeDenialMessage(callerRole, existing.role));
    }

    // role の付け替えは系統の境界の前提を動かすため、系統をまたぐ書き換えは SYS_ADMIN に閉じる
    // （v2-425。閉じないと、編成の側が前提を書き換えて系統をまたぐ追加を作れてしまう）。
    if (!canChangeGroupRole(callerRole, existing.role, dto.role)) {
      throw new ForbiddenException(groupRoleChangeDenialMessage());
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.repo.findByCode(dto.code);
      if (codeExists) {
        throw new ConflictException(`Group with code ${dto.code} already exists`);
      }
    }

    // 確認（findById）と更新の間に別のトランザクションが同じ行を削除した時は、行ロック待ちから
    // 戻った後に 0 行になる。逐次（存在しない id）と同じ 404 に揃える（v2-446）。P2025 を
    // PrismaExceptionFilter に委ねると、同じ「行が無い」状態で文言が経路ごとに変わる。
    //
    // **認可も同じトランザクションの中で、固定した最新行に対してやり直す（v2-485）。** 上の
    // `existing` は事前読みで、`findById` とこの呼出しの間に別トランザクションが `Group.role` を
    // 書き換えて commit すると、書き換え前の系統で認可したまま更新が通る（実測: WH_ADMIN の
    // 更新が待機している間に SYS_ADMIN がグループを OF_USER へ変えると、OF 系統の `name` が
    // 変わった）。事前読みは「対象が在るか」と `code` 重複の確認にだけ使い、境界の判定は
    // 固定した行でやり直す。`assertCanEditGroup` は下の事前検査と同じ判定関数を呼ぶ。
    // 認可の拒否は callback が投げる `ForbiddenException` がトランザクションを rollback させ、
    // そのままここへ伝播する（握らない。403 は既存の応答のまま）。
    const group = await this.repo.updateWithAuthorization(id, dto, (current) =>
      this.assertCanEditGroup(callerRole, current.role, dto.role),
    );

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return ok(group);
  }

  async remove(id: number, callerRole: UserRole | null) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('Group not found');
    }

    this.assertSysAdminArea(
      callerRole,
      [existing.role],
      'システム管理者グループの削除はシステム管理者のみ実行できます',
    );

    // 削除には編成スコープの検査を足さない（v2-425）。削除は対象グループを消すだけで、閲覧権限を
    // 配る経路にならない（宛先グループは下の依存検査が 409 で止めるため、掲示が全社公開へ降格する
    // 経路も塞がっている）。境界を「付与できるか」に揃える方が説明が1つで済む。

    // 依存（所属ユーザー・掲示の宛先）の数え直しと削除を同一トランザクションで行う。宛先グループを
    // 削除すると announcement_roles が CASCADE で消え、宛先が空になった掲示は「全員可視」へ降格する
    // （本文と添付が誰でも読める状態になる）ため、数えた後に宛先が増える競合も Repository 側で
    // 閉じてある（v2-412）。
    const { missing, members, audiences } = await this.repo.deleteIfUnreferenced(id);

    // 同じグループへ同時に DELETE が来た時は、先行が消した後に行ロック待ちから戻った後続が
    // ここへ来る。行が無い時の応答は逐次で再送した時と同じ 404 に揃える（P2025 を 500 に
    // しない。v2-428）。
    if (missing) {
      throw new NotFoundException('Group not found');
    }

    if (members > 0) {
      throw new ConflictException(
        'このグループには所属ユーザーがいるため削除できません。先に所属を外してください',
      );
    }

    if (audiences > 0) {
      throw new ConflictException(
        'このグループは掲示の宛先に指定されているため削除できません。宛先の変更はシステム管理者へご依頼ください',
      );
    }

    return okMessage('Group deleted successfully');
  }

  async findMembers(groupId: number) {
    const group = await this.repo.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const members = await this.repo.findMembers(groupId);

    return ok(members);
  }

  /**
   * SYS_ADMIN 領域（role=SYS_ADMIN のグループ・SYS_ADMIN ロールのユーザー）を、
   * SYS_ADMIN 以外が触れないようにする（v2-412）。
   *
   * users モジュールの権限付与境界（assertSysAdminGrantOnly / assertSysAdminAccountProtected）
   * と同じ境目に揃える。境界の前提（Group.role）を同じ権限で書き換えられると境界が無効になるため、
   * 所属の変更だけでなくグループの作成・変更・削除にも同じ検査を通す。
   * SYS_ADMIN はこの検査をバイパスする（ただし remove の依存検査はバイパスしない）。
   */
  private assertSysAdminArea(
    callerRole: UserRole | null,
    roles: Array<UserRole | null | undefined>,
    message: string,
  ): void {
    if (callerRole === UserRole.SYS_ADMIN) return;
    if (roles.includes(UserRole.SYS_ADMIN)) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * 固定した最新行に対する編集の認可（v2-485）。事前検査と同じ判定関数をこの順で呼ぶ。
   *
   * `assertCanEditGroup` は `update` の事前検査（`assertSysAdminArea` → `canOrganizeGroup` →
   * `canChangeGroupRole`）と同じ順序・同じ文言を、**固定した行の `role`** に対して再現する。
   * 事前検査は逐次経路の応答を変えないために残し、こちらが権限条件の競合を閉じる正規の判定になる。
   */
  private assertCanEditGroup(
    callerRole: UserRole | null,
    currentRole: UserRole,
    nextRole: UserRole | undefined,
  ): void {
    this.assertSysAdminArea(
      callerRole,
      [currentRole, nextRole],
      'システム管理者グループの変更はシステム管理者のみ実行できます',
    );
    if (!canOrganizeGroup(callerRole, currentRole)) {
      throw new ForbiddenException(groupScopeDenialMessage(callerRole, currentRole));
    }
    if (!canChangeGroupRole(callerRole, currentRole, nextRole)) {
      throw new ForbiddenException(groupRoleChangeDenialMessage());
    }
  }

  /**
   * 固定した最新行に対する所属変更の認可（v2-485）。事前検査と同じ順序で同じ判定関数を呼ぶ。
   *
   * 自分の追加は `user.id === callerId` の比較を **固定した行の id** で行う（事前読みの値では
   * なく。事前読みと書込みの間に行が入れ替わっても自己追加の判定が古くならない）。
   * SYS_ADMIN 領域 → 編成の範囲、の順序も事前検査に揃える。
   */
  private assertCanWriteMembership(
    callerRole: UserRole | null,
    callerId: string,
    mode: 'add' | 'remove',
    group: GroupRowSnapshot,
    user: UserRowSnapshot,
  ): void {
    if (mode === 'add') {
      if (!callerId) {
        throw new ForbiddenException('呼び出し元を特定できないため所属を変更できません');
      }
      if (user.id === callerId && callerRole !== UserRole.SYS_ADMIN) {
        throw new ForbiddenException('自分自身をグループへ追加することはできません');
      }
    }

    this.assertSysAdminArea(
      callerRole,
      [group.role, user.role],
      'システム管理者の所属変更はシステム管理者のみ実行できます',
    );

    if (!canOrganizeGroup(callerRole, group.role)) {
      throw new ForbiddenException(groupScopeDenialMessage(callerRole, group.role));
    }
  }

  async addMember(groupId: number, userId: string, callerId: string, callerRole: UserRole | null) {
    if (!callerId) {
      throw new ForbiddenException('呼び出し元を特定できないため所属を変更できません');
    }

    // 事前読みは「対象が在るか」を逐次経路と同じ文言で返すためだけに使う（404 の維持）。
    // **認可は固定した最新行でやり直す（v2-485）。** 事前読みの role で判定してから
    // `findMember` と `create` を呼ぶ旧形は、判定と書込みの間に SYS_ADMIN が系統を変えて
    // commit すると、変更後の担当外グループへ追加できた（実測: WH_ADMIN の追加が
    // `findMember` の後で待機し、OF_USER へ変わったグループへの所属追加が 201 で通った）。
    const group = await this.repo.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 比較は本文の文字列ではなく、DB から引いた行の id で行う（下の callback が固定した行で見る）。
    // 呼び出し元の id は JWT 検証で DB から引き直した値なので、リポジトリが表記を吸収して同じ行を
    // 返す実装へ変わっても自己追加は素通りしない。
    // 認可の拒否は callback が投げる `ForbiddenException` がトランザクションを rollback させ、
    // そのままここへ伝播する（握らない。403 は既存の応答のまま）。
    const result = await this.repo.writeMembershipWithAuthorization<GroupMemberPayload>(
      groupId,
      userId,
      'add',
      (current) =>
        this.assertCanWriteMembership(callerRole, callerId, 'add', current.group!, current.user!),
      (tx, current) =>
        tx.userGroup.create({
          data: { userId: current.user!.id, groupId: current.group!.id },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        }) as Promise<GroupMemberPayload>,
    );

    // 固定した行が消えていた場合は、逐次と同じ 404 に揃える（v2-428/446 の判断を所属操作へ広げる）。
    if (!result.group) {
      throw new NotFoundException('Group not found');
    }
    if (!result.user) {
      throw new NotFoundException('User not found');
    }

    // 既存所属の追加は書込みを投げずに null が返る。逐次と同じ 409 を返す。
    if (!result.value) {
      throw new ConflictException('User is already a member of this group');
    }

    return ok(toGroupMemberResponse(result.value));
  }

  async removeMember(groupId: number, userId: string, callerRole: UserRole | null) {
    // 事前読みは 404 の維持のためだけに使う（addMember と同じ理由。v2-485）。
    const group = await this.repo.findById(groupId);
    const existing = await this.repo.findMember(groupId, userId);

    if (!group || !existing) {
      throw new NotFoundException('Member not found in this group');
    }

    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 認可の拒否は callback が投げる `ForbiddenException` がトランザクションを rollback させ、
    // そのままここへ伝播する（握らない。403 は既存の応答のまま）。
    const result = await this.repo.writeMembershipWithAuthorization(
      groupId,
      userId,
      'remove',
      (current) =>
        this.assertCanWriteMembership(callerRole, '', 'remove', current.group!, current.user!),
      (tx, current) =>
        tx.userGroup.delete({
          where: { userId_groupId: { userId: current.user!.id, groupId: current.group!.id } },
        }),
    );

    // 固定した行が消えていた / 所属が既に無かった場合は、逐次と同じ 404 に揃える。
    if (!result.group || !result.user || !result.value) {
      throw new NotFoundException('Member not found in this group');
    }

    return okMessage('Member removed successfully');
  }
}
