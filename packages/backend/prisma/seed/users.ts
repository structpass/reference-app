import { PrismaClient, UserRole } from '@prisma/client';

/**
 * SSO 一本化後の User seed（spec §8）。
 *
 * 認証情報（password）は rete(IdP) が保持し、reference は authZ（role）のみを持つ。
 * rete Account.id === OIDC sub === reference User.oidcSub。
 * 下記 sub UUID は **rete 側 seed の Account.id と必ず一致させること**（不一致だと SSO ログインで
 * JIT が別ユーザーを作る or email unique 違反になる）。
 */

// bootstrap 管理者は env 経由で sub を共有（rete と reference の両 seed が同じ値を読む）。
export const BOOTSTRAP_ADMIN_SUB =
  process.env.BOOTSTRAP_ADMIN_SUB ?? '00000000-0000-4000-a000-000000000001';

// デモユーザーの固定 sub（rete seed の Account.id とミラー）。
export const DEMO_SUBS = {
  whUser: '00000000-0000-4000-a000-000000000002',
  whAdmin: '00000000-0000-4000-a000-000000000003',
  ofUser: '00000000-0000-4000-a000-000000000004',
  ofAdmin: '00000000-0000-4000-a000-000000000005',
  tanaka: '00000000-0000-4000-a000-000000000006',
} as const;

interface SeedUserDef {
  oidcSub: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

function upsertUser(prisma: PrismaClient, def: SeedUserDef) {
  return prisma.user.upsert({
    where: { oidcSub: def.oidcSub },
    update: { email: def.email, name: def.name, role: def.role, isActive: def.isActive },
    create: { ...def },
  });
}

export async function seedUsers(prisma: PrismaClient) {
  const sysAdmin = await upsertUser(prisma, {
    oidcSub: BOOTSTRAP_ADMIN_SUB,
    email: 'admin@struct-pass.example',
    name: 'システム管理者',
    role: 'SYS_ADMIN',
    isActive: true,
  });
  const whUser = await upsertUser(prisma, {
    oidcSub: DEMO_SUBS.whUser,
    email: 'wh-user@struct-pass.example',
    name: '倉庫 一郎',
    role: 'WH_USER',
    isActive: true,
  });
  const whAdmin = await upsertUser(prisma, {
    oidcSub: DEMO_SUBS.whAdmin,
    email: 'wh-admin@struct-pass.example',
    name: '倉庫 管理太郎',
    role: 'WH_ADMIN',
    isActive: true,
  });
  const ofUser = await upsertUser(prisma, {
    oidcSub: DEMO_SUBS.ofUser,
    email: 'of-user@struct-pass.example',
    name: '事務 花子',
    role: 'OF_USER',
    isActive: true,
  });
  const ofAdmin = await upsertUser(prisma, {
    oidcSub: DEMO_SUBS.ofAdmin,
    email: 'of-admin@struct-pass.example',
    name: '事務 管理子',
    role: 'OF_ADMIN',
    isActive: true,
  });
  const tanaka = await upsertUser(prisma, {
    oidcSub: DEMO_SUBS.tanaka,
    email: 'tanaka@struct-pass.example',
    name: '田中 太郎',
    role: 'WH_ADMIN',
    isActive: true,
  });

  console.log('Users seeded (SSO): 6 linked accounts');
  return { sysAdmin, whUser, whAdmin, ofUser, ofAdmin, tanaka };
}
