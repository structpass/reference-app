import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FindUsersDto } from '../dto/find-users.dto';
import { UserResponseDto, UserWithGroupsResponseDto } from '../dto/user-response.dto';
import {
  toUserResponse,
  toUserWithGroupsResponse,
  UserSelectPayload,
  UserWithGroupsPayload,
} from '../users.mapper';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  // ref-0066: SSO 連携状態（oidcLinked）と許可フラグの公開のため SELECT する（生値は mapper で bool 化）。
  oidcSub: true,
  allowOidcLink: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const USER_SELECT_WITH_GROUPS = {
  ...USER_SELECT,
  userGroups: {
    include: { group: { select: { id: true, name: true, code: true } } },
  },
} as const;

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'email', 'role'] as const;

/**
 * v2-484: `updateGuarded` の型付き結果。
 *
 * 「行が無い（`missing`）」と「行は在るが期待状態と違う（`stateChanged`）」を分ける。
 * この2つは `update` の P2025 では区別できない（meta まで同一。実測）ため、
 * 行ロックの取得結果と、ロックした最新行の照合結果という**別々の材料**から作る。
 * Service は `missing` → 404、`stateChanged` → 409 へ写す。
 */
export type GuardedUserUpdateResult =
  | { outcome: 'updated'; user: UserResponseDto }
  | { outcome: 'missing' }
  | { outcome: 'stateChanged' };

function buildPaginatedWhere(query: FindUsersDto): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
      {
        userGroups: {
          some: { group: { name: { contains: query.search, mode: 'insensitive' } } },
        },
      },
    ];
  }
  if (query.role) where.role = query.role;
  if (query.isActive !== undefined) where.isActive = query.isActive;

  return where;
}

function buildExportWhere(query: FindUsersDto): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.role) where.role = query.role;
  if (query.isActive !== undefined) where.isActive = query.isActive;

  return where;
}

function resolveSort(sort: string | undefined): string {
  if (!sort) return 'createdAt';
  return (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'createdAt';
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByIdWithGroups(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT_WITH_GROUPS,
    });
  }

  /** OIDC sub による引き当て（JIT プロビジョニングのリンクキー）。 */
  findByOidcSub(oidcSub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { oidcSub } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * メール一致・未連携・管理者許可あり の条件付きで oidc_sub を後付けリンクする（ref-0066）。
   * where 条件を満たす行だけを単一 UPDATE で原子的に更新し、影響行数（0 or 1）を返す。
   * 判定（読み取り）と消費（書き込み）を 1 文に束ねることで check-then-act の TOCTOU を塞ぎ、
   * 並行 SSO ログインでもフラグが二重消費されない。
   */
  linkOidcSub(email: string, data: Prisma.UserUpdateInput): Promise<number> {
    return this.prisma.user
      .updateMany({
        where: { email, oidcSub: null, allowOidcLink: true },
        data,
      })
      .then((res) => res.count);
  }

  async findManyPaginated(query: FindUsersDto): Promise<{
    success: true;
    data: UserWithGroupsResponseDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page = 1, limit = 20, order = 'desc' } = query;
    const where = buildPaginatedWhere(query);
    const sortField = resolveSort(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortField]: order },
        select: USER_SELECT_WITH_GROUPS,
      }) as Promise<UserWithGroupsPayload[]>,
      this.prisma.user.count({ where }),
    ]);

    return {
      success: true as const,
      data: data.map(toUserWithGroupsResponse),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findManyForExport(query: FindUsersDto): Promise<UserResponseDto[]> {
    const { order = 'desc' } = query;
    const where = buildExportWhere(query);
    const sortField = resolveSort(query.sort);

    const data = (await this.prisma.user.findMany({
      where,
      orderBy: { [sortField]: order },
      select: USER_SELECT,
    })) as UserSelectPayload[];

    return data.map(toUserResponse);
  }

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
      select: USER_SELECT,
    });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  /**
   * v2-484: 更新の期待状態を**行ロックの下で読み直し**、同じトランザクションで書き込む。
   *
   * 背景（実測）: `update` の where は id だけなので、Service が `findById` で読んだ状態で
   * 認可・保護判定をした後に SYS_ADMIN が `allowOidcLink=true` を commit すると、古い判定のまま
   * メールを差し替えられる（`linkOidcSub` はメール一致を唯一の引き当てキーにするため、許可の
   * 宛先を後から付け替えられる）。判定と書き込みが別の文であることが穴の本体である。
   *
   * **なぜ「拡張 where を持つ `update`」ではないか（v2-484 の実測）:** Prisma 6.19.2 の
   * `update` は `where: UserWhereUniqueInput`（= `AtLeast<{...}, "id"|"oidcSub"|"email">`）に
   * 非ユニーク条件を足せるが、0 件一致は `update` が **P2025 を投げる**（`null` を返さない）。
   * しかも「行は在るが期待状態と違う」と「行そのものが無い」で P2025 の `meta` まで
   * **バイト一致**し（どちらも `{modelName:'User', cause:'No record was found for an update.'}`）、
   * **不在と状態変更を区別できない**。さらに `oidcSub` は `String? @unique` のため
   * `UserWhereUniqueInput` では `oidcSub?: string`（非 null）と型付けられ、`oidcSub: null` は
   * `PrismaClientValidationError`（Argument 'oidcSub' must not be null）になる。
   * よって要求が名指した手段では要求の受入条件（不在→404 / 状態変更→409 の型付き分岐）を
   * 満たせない。`updateMany` / `updateManyAndReturn` の 0 件も同じく区別を与えず、加えて
   * 空 `data` を扱えない（`updateManyAndReturn` は空 `data` で
   * `syntax error at or near "WHERE"` になる。実測）。
   *
   * 採った形は既存の `groups.repository.ts` の `updateIfPresent` / ADR 0029 と同じ家風で、
   * 判定材料を**ロックした最新行**に置き換える:
   *
   *   1. 対象行を `FOR NO KEY UPDATE` で固定する。同じ行への素の `prisma.user.update` も
   *      `FOR NO KEY UPDATE` を取るため**待たされる**（実測: 先行の保持で後続の素の update が
   *      377ms 待たされ、解放後は古い判定で通らず P2025 になった）。これが
   *      「読み取り後に許可が commit される」窓を閉じる実体である。
   *      **`FOR SHARE` は採らない。** 同じ窓は閉じるが、`users` を参照する行の挿入
   *      （外部キー検査の `FOR KEY SHARE`）まで待たせる（実測: `FOR SHARE` 保持中の所属追加が
   *      341ms 待ち、`FOR NO KEY UPDATE` なら 6ms で通る）。編集と無関係な所属追加を止めない側を
   *      採る（`groups.repository.ts` の `updateIfPresent` と同じ強さ）。逆向き（参照行の挿入を
   *      保持したままの更新）も `FOR NO KEY UPDATE` は待たされない（36ms）。
   *   2. 固定の取得結果を**在否の判定に使う**（`count` では見ない）。0 行なら `missing` を返し、
   *      書き込みを投げない（投げると P2025 になり、逐次と同じ結果を例外の解釈に頼ることになる）。
   *   3. ロックした最新行を `expectation` と照合する。不一致なら `stateChanged` を返し、
   *      **書き込みを投げない**。これが要求の「事前読取の保護状態を条件に含める」の実現で、
   *      比較対象が事前読取ではなく同じトランザクションで固定した行になる点だけが要求と違う。
   *   4. 一致した時だけ同じトランザクションで `update` する。`data` が空でも `update` は行を
   *      返すため、**「空 data でも既存行を返す」契約を維持できる**（`updateMany` の `count` を
   *      採ると空 data で既存行でも 0 になり不在と誤認する。実測: v2-446）。
   *
   * `expectation` は更新するフィールドの保護条件だけを呼び出し元が渡す（省略したフィールドは
   * 比較しない）。照合は Prisma に任せ、フィールドごとの比較規則を写経しない。
   *
   * P2025 は解釈しない。不在は 2 の固定結果が持ち、Prisma エラーはそのまま再スローして
   * `PrismaExceptionFilter` に委譲する既存規約を維持する。
   * `$transaction` の timeout は `groups.repository.ts` と同じ `{60_000, 10_000}` に揃える
   * （既定 5 秒だと、長いロック待ちが P2028 → 503 になり、逐次 404 に対して退行する）。
   */
  updateGuarded(
    id: string,
    data: Prisma.UserUpdateInput,
    expectation: Prisma.UserWhereInput,
  ): Promise<GuardedUserUpdateResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // FOR NO KEY UPDATE: 同じ行への素の update（同じ強さ）と衝突して待たせる一方、
        // users を参照する行の挿入（FOR KEY SHARE）は待たせない（上の doc を参照）。
        // users.id は text なので uuid キャストを付けない（付けると 42883 で落ちる。実測）。
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM users WHERE id = ${id} FOR NO KEY UPDATE`;

        if (locked.length === 0) {
          return { outcome: 'missing' as const };
        }

        // 期待状態との照合。ロック済みの同じ tx から引くので、ここで一致した値は
        // そのまま書き込みまで有効である（他のトランザクションは行ロックで待たされる）。
        const matches = await tx.user.findFirst({
          where: { AND: [{ id }, expectation] },
          select: { id: true },
        });
        if (!matches) {
          return { outcome: 'stateChanged' as const };
        }

        const user = (await tx.user.update({
          where: { id },
          data,
          select: USER_SELECT,
        })) as UserSelectPayload;
        return { outcome: 'updated' as const, user: toUserResponse(user) };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  delete(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
