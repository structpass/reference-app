import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '@/database/prisma.service';
import { startPostgresAndMigrate, IntegrationDb } from './helpers/testcontainer.helper';

/**
 * 利用者への参照を持つ表が、利用者の削除で記録を書き換えないことを確かめる（d810）。
 *
 * 掲示の作成者・更新者、システム設定と一覧のページサイズ設定の最終更新者、告知の添付者は、
 * これまで ON DELETE SET NULL だった。利用者を消すと誰が書いた・触ったかの欄が空になるため、
 * 品目（d630）と同じ ON DELETE RESTRICT に揃えた。
 */
describe('利用者を参照する記録の保持 (d810)', () => {
  /** 表・欄・制約名。すべて RESTRICT（'r'）であることを確かめる対象。 */
  const userRefs = [
    ['table_pagination_settings', 'updated_by_id', 'table_pagination_settings_updated_by_id_fkey'],
    ['system_parameters', 'updated_by_id', 'system_parameters_updated_by_id_fkey'],
    ['announcements', 'updated_by_id', 'announcements_updated_by_id_fkey'],
    ['announcement_attachments', 'created_by_id', 'announcement_attachments_created_by_id_fkey'],
    ['announcements', 'created_by_id', 'announcements_created_by_id_fkey'],
  ] as const;

  let db: IntegrationDb;
  let prisma: PrismaService;

  beforeAll(async () => {
    db = await startPostgresAndMigrate();
    prisma = new PrismaService({ datasourceUrl: db.databaseUrl });
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.container.stop();
  });

  const createUser = (name: string) =>
    prisma.user.create({ data: { name, email: `${name}@retention.test.local` } });
  const createAnnouncement = (createdById: string, updatedById: string) =>
    prisma.announcement.create({
      data: {
        title: '保持試験',
        bodyMarkdown: '本文',
        createdById,
        updatedById,
        attachments: {
          create: [
            {
              fileName: 'a.txt',
              storagePath: '/a.txt',
              mimeType: 'text/plain',
              sizeBytes: 1,
              createdById: updatedById,
            },
          ],
        },
      },
    });

  it('利用者を参照する欄が、すべて削除を止める制約になっている', async () => {
    for (const [table, column, constraint] of userRefs) {
      const constraints = await prisma.$queryRaw<{ confdeltype: string; convalidated: boolean }[]>`
        SELECT confdeltype::text, convalidated FROM pg_constraint WHERE conname = ${constraint}
      `;
      // 'r' = RESTRICT。'n'（SET NULL）に戻ると、利用者の削除で記録が空になる。
      expect({ table, column, constraints }).toEqual({
        table,
        column,
        constraints: [{ confdeltype: 'r', convalidated: true }],
      });
    }
  });

  it('既存の記録を持つ利用者の削除を止め、記録を書き換えない', async () => {
    const creator = await createUser('creator');
    const editor = await createUser('editor');
    const announcement = await createAnnouncement(creator.id, editor.id);
    const systemSetting = await prisma.systemSetting.create({
      data: { key: 'retention_key', value: 'v', label: '保持試験', updatedById: editor.id },
    });
    const pagination = await prisma.tablePaginationSetting.create({
      data: {
        tableId: 'retention_table',
        defaultPageSize: 10,
        pageSizeOptions: '10,20',
        updatedById: editor.id,
      },
    });
    const announcementBefore = await prisma.announcement.findUniqueOrThrow({
      where: { id: announcement.id },
    });
    const attachmentBefore = await prisma.announcementAttachment.findMany();

    // 記録を持たない利用者は消せる（記録の保持だけが理由で消せなくなっているわけではない）。
    const unused = await createUser('unused');
    await prisma.user.delete({ where: { id: unused.id } });

    for (const userId of [creator.id, editor.id]) {
      await expect(prisma.user.delete({ where: { id: userId } })).rejects.toMatchObject({
        code: 'P2003',
      });
    }

    // 削除が止まったうえで、記録の値が元のままであること（空に書き換わっていない）。
    expect(await prisma.announcement.findUniqueOrThrow({ where: { id: announcement.id } })).toEqual(
      announcementBefore,
    );
    expect(await prisma.announcementAttachment.findMany()).toEqual(attachmentBefore);
    expect(
      await prisma.systemSetting.findUniqueOrThrow({ where: { id: systemSetting.id } }),
    ).toMatchObject({ updatedById: editor.id });
    expect(
      await prisma.tablePaginationSetting.findUniqueOrThrow({
        where: { tableId: pagination.tableId },
      }),
    ).toMatchObject({ updatedById: editor.id });
  });

  it('5 つの欄それぞれが、単独でも利用者の削除を止める', async () => {
    // 抑止の根拠を欄ごとに切り分ける。消そうとする利用者は、その 1 欄だけを持ち、
    // 他の欄（作成者・更新者の反対側）は別の利用者に持たせる。そうしないと、どの制約で
    // 止まったのかが分からない（実際に最初は作成者側の制約で止まっていた）。
    // 止まった理由は、Prisma が返す外部キー違反の制約名（meta.constraint）で確かめる。
    // メッセージ本文の書式から拾うと Prisma の版に左右されるため、meta を使う。
    const blockedBy = async (userId: string) => {
      const error = (await prisma.user
        .delete({ where: { id: userId } })
        .then(() => null)
        .catch((e: unknown) => e)) as { code?: string; meta?: { constraint?: string } } | null;
      return error?.code === 'P2003'
        ? (error.meta?.constraint ?? '')
        : `not-blocked:${error?.code ?? 'deleted'}`;
    };
    for (const [index, [, , constraint]] of userRefs.entries()) {
      const target = await createUser(`only-${index}`);
      // 掲示だけは作成者と更新者の 2 人が並ぶので、反対側の人も別に持つ。他の欄は 1 人だけ関わる。
      // 反対側の人が自分の欄で止まることも、その欄の制約名まで確かめる。
      let counterpart: { id: string; blockedBy: string } | null = null;
      switch (constraint) {
        case 'announcements_updated_by_id_fkey':
          // 作成者を作り合いの利用者、更新者を消そうとする利用者にする。
          counterpart = {
            ...(await createUser(`counterpart-${index}`)),
            blockedBy: 'announcements_created_by_id_fkey',
          };
          // 添付を作るヘルパーは使わず、対象が更新者の欄だけを持つ形にする。
          await prisma.announcement.create({
            data: {
              title: '更新者のみ',
              bodyMarkdown: '本文',
              createdById: counterpart.id,
              updatedById: target.id,
            },
          });
          break;
        case 'announcement_attachments_created_by_id_fkey': {
          // 作成者と添付者を分け、更新者は設定しない。両者がそれぞれ1つの制約だけを持つ。
          counterpart = {
            ...(await createUser(`counterpart-${index}`)),
            blockedBy: 'announcements_created_by_id_fkey',
          };
          await prisma.announcement.create({
            data: {
              title: '添付者のみ',
              bodyMarkdown: '本文',
              createdById: counterpart.id,
              attachments: {
                create: [
                  {
                    fileName: 'a.txt',
                    storagePath: '/a.txt',
                    mimeType: 'text/plain',
                    sizeBytes: 1,
                    createdById: target.id,
                  },
                ],
              },
            },
          });
          break;
        }
        case 'system_parameters_updated_by_id_fkey':
          await prisma.systemSetting.create({
            data: {
              key: `only_setting_${index}`,
              value: 'v',
              label: '試験',
              updatedById: target.id,
            },
          });
          break;
        case 'table_pagination_settings_updated_by_id_fkey':
          await prisma.tablePaginationSetting.create({
            data: {
              tableId: `only_table_${index}`,
              defaultPageSize: 10,
              pageSizeOptions: '10,20',
              updatedById: target.id,
            },
          });
          break;
        default:
          // announcements_created_by_id_fkey（NOT NULL のため作成者を持つ利用者を作る）
          await prisma.announcement.create({
            data: { title: '作成者のみ', bodyMarkdown: '本文', createdById: target.id },
          });
      }
      // 止めたのがこの欄の制約であることまで確かめる（別の制約で止まった取り違えを許さない）。
      expect({ constraint, blockedBy: await blockedBy(target.id) }).toEqual({
        constraint,
        blockedBy: constraint,
      });
      // 反対側の欄だけを持つ利用者も、自分が押さえている欄で止まる（両方の利用者を消せない）。
      if (counterpart) {
        expect({ constraint, counterpart: await blockedBy(counterpart.id) }).toEqual({
          constraint,
          counterpart: counterpart.blockedBy,
        });
      }
    }
  });

  it('SET NULL だった旧制約からの移行で、既存の記録を書き換えず RESTRICT へ変える', async () => {
    const creator = await createUser('migration-creator');
    const editor = await createUser('migration-editor');
    const announcement = await createAnnouncement(creator.id, editor.id);
    await prisma.systemSetting.create({
      data: { key: 'migration_key', value: 'v', label: '移行試験', updatedById: editor.id },
    });
    await prisma.tablePaginationSetting.create({
      data: {
        tableId: 'migration_table',
        defaultPageSize: 10,
        pageSizeOptions: '10,20',
        updatedById: editor.id,
      },
    });

    // 適用前の DB（ON DELETE SET NULL）へ戻してから移行を流す。
    for (const [table, column, constraint] of userRefs) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`);
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      );
    }
    const before = {
      announcement: await prisma.announcement.findUniqueOrThrow({ where: { id: announcement.id } }),
      attachments: await prisma.announcementAttachment.findMany(),
      settings: await prisma.systemSetting.findMany(),
      pagination: await prisma.tablePaginationSetting.findMany(),
    };

    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20261027020000_restrict_remaining_user_refs/migration.sql',
      ),
      'utf8',
    );
    const applied = await db.container.exec([
      'psql',
      '-U',
      db.container.getUsername(),
      '-d',
      db.container.getDatabase(),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      migration,
    ]);
    expect(applied.exitCode).toBe(0);

    expect({
      announcement: await prisma.announcement.findUniqueOrThrow({ where: { id: announcement.id } }),
      attachments: await prisma.announcementAttachment.findMany(),
      settings: await prisma.systemSetting.findMany(),
      pagination: await prisma.tablePaginationSetting.findMany(),
    }).toEqual(before);

    for (const [table, column, constraint] of userRefs) {
      const constraints = await prisma.$queryRaw<{ confdeltype: string; convalidated: boolean }[]>`
        SELECT confdeltype::text, convalidated FROM pg_constraint WHERE conname = ${constraint}
      `;
      expect({ table, column, constraints }).toEqual({
        table,
        column,
        constraints: [{ confdeltype: 'r', convalidated: true }],
      });
    }
    await expect(prisma.user.delete({ where: { id: editor.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    expect(
      await prisma.announcement.findUniqueOrThrow({ where: { id: announcement.id } }),
    ).toMatchObject({ updatedById: editor.id });
  });
});
