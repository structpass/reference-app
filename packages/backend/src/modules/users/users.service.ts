import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { ok, okMessage } from '../../common/dto';
import { UsersRepository } from './repositories/users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindUsersDto } from './dto/find-users.dto';
import { toUserResponse, toUserWithGroupsResponse, UserSelectPayload } from './users.mapper';

/** OIDC claims から JIT プロビジョニングする際の入力（auth/oidc の OidcClaims と structural に一致）。 */
export interface OidcProvisionInput {
  sub: string;
  email: string;
  name: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findById(id);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findByEmail(email);
  }

  /**
   * OIDC sub をキーに User を引き当て、無ければ pending（role=null / isActive=false）で JIT 作成する（spec §4.3）。
   * email による既存 User の後付けリンクは行わない（なりすまし防止）。
   * rete を identity SoT とし、ログイン毎に email/name を claim で更新する。
   */
  async provisionFromOidc(claims: OidcProvisionInput): Promise<UserSelectPayload> {
    const existing = await this.repo.findByOidcSub(claims.sub);
    if (existing) {
      // 空（空白含む）claim で既存の正しい email/name を上書きしない（再発防止・defense in depth）。
      // 通常 oidc.service が email を保証するが、万一空が来ても DB を汚さないための二重ガード。
      return this.repo.update(existing.id, {
        ...(claims.email?.trim() ? { email: claims.email } : {}),
        ...(claims.name?.trim() ? { name: claims.name } : {}),
        lastLoginAt: new Date(),
      });
    }
    // 新規プロビジョニングは identity（email）必須。空なら作らず loud に失敗させ、
    // 空 email User の生成 → 後続の unique 衝突という温床を断つ（upstream 依存を断ち切る二重ガード）。
    if (!claims.email?.trim()) {
      throw new InternalServerErrorException(
        'OIDC claims に email が無く新規ユーザーを作成できません',
      );
    }
    try {
      return await this.repo.create({
        oidcSub: claims.sub,
        email: claims.email,
        name: claims.name,
        role: null,
        isActive: false,
        lastLoginAt: new Date(),
      });
    } catch (e) {
      // 同一 sub の初回ログイン並行（二重クリック / 2 タブ）で check-then-create が競合し
      // users_oidc_sub_key の P2002 になるケース。再取得して冪等に JIT を完遂する
      // （rev-quality 2026-07-31 DB-M1: 409 → /login?error=sso の一時エラーを解消）。
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await this.repo.findByOidcSub(claims.sub);
        if (raced) {
          return this.repo.update(raced.id, {
            ...(claims.email?.trim() ? { email: claims.email } : {}),
            ...(claims.name?.trim() ? { name: claims.name } : {}),
            lastLoginAt: new Date(),
          });
        }
        // sub では衝突しない＝email が既存アカウント（管理者が事前作成等）と衝突。
        // メール一致・未連携・管理者許可（allowOidcLink=true）を条件付き単一 UPDATE で原子的に
        // 満たした時だけ sub を後付けリンクし、許可フラグをその場で消費する（ref-0066）。
        // 判定と消費を 1 文に束ねるので、並行 SSO ログインでもフラグは二重消費されない
        // （check-then-act の TOCTOU 対策・code-reviewer/database-reviewer 指摘）。
        // 許可の無いリンクはなりすまし防止のため従来どおり拒否（現行 409）。
        let linked = 0;
        try {
          linked = await this.repo.linkOidcSub(claims.email, {
            oidcSub: claims.sub,
            ...(claims.email?.trim() ? { email: claims.email } : {}),
            ...(claims.name?.trim() ? { name: claims.name } : {}),
            lastLoginAt: new Date(),
            allowOidcLink: false,
          });
        } catch (e) {
          // 同一 sub が並行 create で先にリンク済み（sub UNIQUE 衝突）の場合は冪等に完遂する。
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            const raced = await this.repo.findByOidcSub(claims.sub);
            if (raced) return raced;
          }
          throw e;
        }
        if (linked === 0) {
          // 0 行 = 許可無し・既リンク・メール不一致。並行で同 sub が先にリンク済みなら冪等に返す。
          const raced = await this.repo.findByOidcSub(claims.sub);
          if (raced) return raced;
          throw new ConflictException(
            'このメールアドレスは既に登録されています。管理者に SSO 連携を依頼してください',
          );
        }
        const linkedUser = await this.repo.findByEmail(claims.email);
        if (linkedUser) return linkedUser;
        throw new ConflictException(
          'このメールアドレスは既に登録されています。管理者に SSO 連携を依頼してください',
        );
      }
      throw e;
    }
  }

  async findAll(query: FindUsersDto) {
    return this.repo.findManyPaginated(query);
  }

  async findAllForExport(query: FindUsersDto) {
    return this.repo.findManyForExport(query);
  }

  async findOne(id: string) {
    const user = await this.repo.findByIdWithGroups(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return ok(toUserWithGroupsResponse(user));
  }

  async create(dto: CreateUserDto, callerRole: UserRole | null) {
    this.assertSysAdminGrantOnly(callerRole, dto.role);

    const existingEmail = await this.repo.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(`Email ${dto.email} already exists`);
    }

    const user = await this.repo.create({
      name: dto.name,
      email: dto.email,
      role: dto.role ?? null,
      isActive: dto.isActive ?? true,
    });

    return ok(toUserResponse(user));
  }

  async update(id: string, dto: UpdateUserDto, callerRole: UserRole | null) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    this.assertSysAdminAccountProtected(callerRole, existing.role);
    this.assertSysAdminGrantOnly(callerRole, dto.role);

    if (dto.email && dto.email !== existing.email) {
      // v2-426: 未連携かつ SSO 連携許可済みの行のメールは書き換えさせない。
      // linkOidcSub はメール一致を唯一の引き当てキーにするため、許可が立ったままメールを
      // 差し替えると「許可の宛先」を後から付け替えられる（SYS_ADMIN が許可 → 非 SYS_ADMIN が
      // メール変更 → そのメールを名乗る SSO ログインが既存の行へリンク、の逆順の迂回）。
      // 許可を立てる操作（下の SYS_ADMIN 限定）と両側から閉じる。
      if (
        callerRole !== UserRole.SYS_ADMIN &&
        existing.oidcSub === null &&
        existing.allowOidcLink
      ) {
        throw new ConflictException(
          'SSO 連携を許可済みのユーザーはメールアドレスを変更できません。システム管理者に依頼してください',
        );
      }

      const emailExists = await this.repo.findByEmail(dto.email);
      if (emailExists) {
        throw new ConflictException(`Email ${dto.email} already exists`);
      }
    }

    // ref-0066: SSO 連携の許可操作は未連携ユーザーにのみ有効。
    // 連携済みユーザーは既にログイン可能なため許可は不要（UI 非表示と API の二重ガード）。
    if (dto.allowOidcLink !== undefined && existing.oidcSub !== null) {
      throw new ConflictException('このユーザーは既に SSO 連携済みです');
    }

    // v2-426: SSO 連携の許可は SYS_ADMIN のみに限る。
    // linkOidcSub は「メール一致・未連携・許可フラグ」の3条件だけで後付けリンクするため、
    // users:update を持つ管理者（WH_ADMIN / OF_ADMIN）が許可を立てられると、任意のメールを
    // 名乗る SSO ログインを既存の行（ロールとグループ所属ごと）へ結び付けられてしまう。
    // 他者の身元を既存アカウントへ結び付ける操作は、ユーザーマスタの他の境界
    // （assertSysAdminGrantOnly / assertSysAdminAccountProtected）と同じ境目に揃える。
    // 同時更新の禁止だけでは 2 段の操作（メール変更 → 許可）で迂回できることを実測で確認した。
    if (dto.allowOidcLink === true && callerRole !== UserRole.SYS_ADMIN) {
      throw new ForbiddenException('SSO 連携の許可はシステム管理者のみ実行できます');
    }

    const user = await this.repo.updateGuarded(
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.allowOidcLink !== undefined ? { allowOidcLink: dto.allowOidcLink } : {}),
      },
      // v2-484: 上の判定（認可・保護・許可済みメール）は**事前読取**に基づくため、読取と書込みの
      // 間に別のトランザクションが保護状態を書き換えると、古い判定のまま書き込まれる。
      // 実測した競合: WH_ADMIN のメール更新を findByEmail 後で待たせ、SYS_ADMIN が元メールへの
      // 許可（allowOidcLink=true）を commit してから解放すると、許可済み行のメールが攻撃者用の
      // 合成メールへ差し替わり、続く実 provisionFromOidc が同じ行へリンクして OF_ADMIN を返した。
      //
      // 同じ穴を「書き込みの前提条件」として閉じる。事前読取で見た保護状態を期待値として渡し、
      // Repository が行ロックの下で最新行と照合してから書く。事前読取は下の判定（403/409 の
      // 出し分け）のためにそのまま残す — ここで渡す期待値は「その後状態が変わっていないこと」の
      // 確認であって、認可判断そのものではない（認可は事前読取の役割と SYS_ADMIN の正当用途を維持）。
      //
      // 対象は保護状態（role / email / oidcSub / allowOidcLink）。name / isActive の同時変更は
      // 保護対象ではないため期待値に含めない（含めると無関係な同時編集で 409 を出す過剰な拒否になる）。
      {
        role: existing.role,
        email: existing.email,
        oidcSub: existing.oidcSub,
        allowOidcLink: existing.allowOidcLink,
      },
    );

    // v2-484: Repository の型付き結果を、逐次と同じ応答へ写す。
    // missing は事前読取の後に削除された場合（逐次の不在と同じ 404）。
    // stateChanged は事前読取の後に保護状態が変わった場合で、古い判定に基づく書き込みを
    // 拒否したことを表す（409。メール差し替えの拒否と同じ意味づけに揃える）。
    if (user.outcome === 'missing') {
      throw new NotFoundException('User not found');
    }
    if (user.outcome === 'stateChanged') {
      throw new ConflictException(
        '対象のユーザー情報が同時に更新されました。最新の状態を確認して再実行してください',
      );
    }

    return ok(user.user);
  }

  async remove(id: string, callerRole: UserRole | null) {
    const existing = await this.repo.findById(id);

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    this.assertSysAdminAccountProtected(callerRole, existing.role);

    await this.repo.delete(id);

    return okMessage('User deleted successfully');
  }

  /**
   * SYS_ADMIN ロールの付与は SYS_ADMIN のみ可（rev-quality 2026-07-31 SEC-H1: 権限昇格の防止）。
   * 他ロールの付与（pending 承認を含む）は従来どおり users:create/update 権限を持つ管理者が実行できる。
   */
  private assertSysAdminGrantOnly(
    callerRole: UserRole | null,
    targetRole: UserRole | null | undefined,
  ): void {
    if (targetRole === UserRole.SYS_ADMIN && callerRole !== UserRole.SYS_ADMIN) {
      throw new ForbiddenException('SYS_ADMIN ロールの付与はシステム管理者のみ実行できます');
    }
  }

  /**
   * SYS_ADMIN アカウントへの変更・削除は SYS_ADMIN のみ可（管理者間での無効化・降格・削除から保護）。
   */
  private assertSysAdminAccountProtected(
    callerRole: UserRole | null,
    targetRole: UserRole | null,
  ): void {
    if (targetRole === UserRole.SYS_ADMIN && callerRole !== UserRole.SYS_ADMIN) {
      throw new ForbiddenException('SYS_ADMIN アカウントの変更はシステム管理者のみ実行できます');
    }
  }
}
