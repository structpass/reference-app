import { PrismaClient } from '@prisma/client';
import { seedAnnouncements } from './seed/announcements';
import { BOOTSTRAP_ADMIN_SUB } from './seed/users';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding announcements only...');

  const sysAdmin = await prisma.user.findUnique({ where: { oidcSub: BOOTSTRAP_ADMIN_SUB } });
  if (!sysAdmin) {
    throw new Error('admin user not found. Run full seed (pnpm prisma:seed) first.');
  }

  const groups = await prisma.group.findMany();
  if (groups.length === 0) {
    throw new Error('groups not found. Run full seed (pnpm prisma:seed) first.');
  }

  await seedAnnouncements(prisma, { creatorUserId: sysAdmin.id, groups });

  console.log('Announcements seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
