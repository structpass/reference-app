import { InternalServerErrorException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { AnnouncementStorageService } from './announcement-storage.service';

/**
 * 添付ファイルの保存先を守る防御そのものを確かめる（d602）。
 *
 * 上位の announcements.service.spec.ts は storage を mock で差し替えるため、resolveSafe
 * （保存先の外へ読み書きしない検証）と sanitizeExt（拡張子の整形）は誰にも実行されていなかった。
 * ここでは実ファイルシステム上に使い捨ての保存先を作り、外へ出る経路が本当に塞がれているかを見る。
 */

// 保存先の外を指した時に読み出しが始まっていないことを、呼び出し回数で見る。
// jest.mock の工場は巻き上げで外側の変数を掴めないので、記録は globalThis を経由する。
// 実物はモジュールの初期化時に束ねただけの関数なので、差し替えても this を失わない。
jest.mock('node:fs', () => {
  const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
  const calls = { count: 0 };
  (globalThis as Record<string, unknown>).__announcementStorageReadStreamCalls = calls;
  const createReadStreamSpy = (...args: Parameters<typeof actual.createReadStream>) => {
    calls.count += 1;
    return actual.createReadStream(...args);
  };
  return { ...actual, createReadStream: createReadStreamSpy };
});

const calls = { count: 0 };
(globalThis as Record<string, unknown>).__announcementStorageReadStreamCalls = calls;

function readStreamCalls(): number {
  const counter = (globalThis as Record<string, unknown>).__announcementStorageReadStreamCalls as {
    count: number;
  };
  return counter.count;
}

function makeFile(
  originalName: string,
  contents = 'body',
): {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
} {
  const buffer = Buffer.from(contents);
  return { buffer, originalName, mimeType: 'application/octet-stream', sizeBytes: buffer.length };
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 保存先の外を指す読み出しが、中身を返さずに止まることを確かめる。 */
async function expectRejectedOutside(action: () => Promise<unknown>): Promise<void> {
  let settled: { ok: true } | { ok: false; reason: unknown };
  try {
    await action();
    settled = { ok: true };
  } catch (reason) {
    settled = { ok: false, reason };
  }
  expect(settled.ok).toBe(false);
  expect(settled.ok ? undefined : settled.reason).toBeInstanceOf(InternalServerErrorException);
}

describe('AnnouncementStorageService', () => {
  const originalDir = process.env.ANNOUNCEMENT_UPLOAD_DIR;
  let root: string;
  let baseDir: string;
  let service: AnnouncementStorageService;

  beforeEach(async () => {
    calls.count = 0;
    // 保存先の外側（root 直下）に置いたファイルを、外へ出る経路の標的にする。
    root = await fs.mkdtemp(path.join(tmpdir(), 'announcement-storage-'));
    baseDir = path.join(root, 'uploads');
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(path.join(root, 'outside.txt'), 'outside', 'utf8');
    process.env.ANNOUNCEMENT_UPLOAD_DIR = baseDir;
    service = new AnnouncementStorageService();
  });

  afterEach(async () => {
    if (originalDir === undefined) {
      delete process.env.ANNOUNCEMENT_UPLOAD_DIR;
    } else {
      process.env.ANNOUNCEMENT_UPLOAD_DIR = originalDir;
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('save（保存先の内側にだけ書く）', () => {
    it('保存先の下に掲示ごとのフォルダを作り、保存先からの相対パスを / 区切りで返す', async () => {
      const result = await service.save(42, makeFile('doc.pdf'));

      expect(result.storagePath).toMatch(/^42\/[0-9a-f-]{36}\.pdf$/);
      const saved = path.join(baseDir, '42', path.basename(result.storagePath));
      expect(await fs.readFile(saved, 'utf8')).toBe('body');
    });

    it('同じファイル名を二度保存しても別の名前に分かれ、先のファイルを上書きしない', async () => {
      const first = await service.save(1, makeFile('doc.pdf', 'first'));
      const second = await service.save(1, makeFile('doc.pdf', 'second'));

      expect(second.storagePath).not.toBe(first.storagePath);
      expect(await fs.readFile(path.join(baseDir, first.storagePath), 'utf8')).toBe('first');
      expect(await fs.readFile(path.join(baseDir, second.storagePath), 'utf8')).toBe('second');
    });

    it('ファイル名に親ディレクトリを遡る指定が入っていても、フォルダを出ずに保存する', async () => {
      const result = await service.save(7, makeFile('../../../evil.txt'));

      // 名前は UUID + 拡張子に置き換わり、ディレクトリ部分は持ち越さない。
      expect(result.storagePath).toMatch(/^7\/[0-9a-f-]{36}\.txt$/);
      const absolute = path.resolve(baseDir, result.storagePath);
      expect(absolute.startsWith(path.resolve(baseDir) + path.sep)).toBe(true);
      expect(await fs.readdir(root)).toEqual(expect.arrayContaining(['uploads', 'outside.txt']));
      expect(await fs.readdir(root)).not.toContain('evil.txt');
      expect(await fs.readFile(absolute, 'utf8')).toBe('body');
    });
  });

  describe('resolveSafe（保存先の外を読まない）', () => {
    it.each(['../outside.txt', '../../outside.txt', path.join('1', '..', '..', 'outside.txt')])(
      '保存先の外を指す %s は読み出さずに 500 で止める',
      async (storagePath) => {
        await expectRejectedOutside(() => readAll(service.createReadStream(storagePath)));
        expect(readStreamCalls()).toBe(0);
      },
    );

    it('保存先の兄弟ディレクトリ（前方一致するだけの名前）も外として扱う', async () => {
      const sibling = `${baseDir}-evil`;
      await fs.mkdir(sibling, { recursive: true });
      await fs.writeFile(path.join(sibling, 'leak.txt'), 'leak', 'utf8');

      const outsidePath = path.join('..', `${path.basename(baseDir)}-evil`, 'leak.txt');
      await expectRejectedOutside(() => readAll(service.createReadStream(outsidePath)));
      expect(readStreamCalls()).toBe(0);
    });

    it('保存先の内側のパスはそのまま読み出せる', async () => {
      const { storagePath } = await service.save(3, makeFile('doc.txt', 'inside'));

      await expect(readAll(service.createReadStream(storagePath))).resolves.toBe('inside');
    });
  });

  describe('remove / removeMany（保存先の外は消さない）', () => {
    it('保存先の外を指すパスは消さずに 500 で止める', async () => {
      await expect(service.remove('../outside.txt')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(await fs.readFile(path.join(root, 'outside.txt'), 'utf8')).toBe('outside');
    });

    it('保存先の内側なら消す。無いファイルを消しても失敗しない', async () => {
      const { storagePath } = await service.save(5, makeFile('doc.pdf'));

      await expect(service.remove(storagePath)).resolves.toBeUndefined();
      await expect(fs.stat(path.join(baseDir, storagePath))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(service.remove(storagePath)).resolves.toBeUndefined();
    });

    it('複数のうち 1 つでも外を指せば、その 1 つは消さずに 500 になる', async () => {
      const valid = await service.save(9, makeFile('keep.txt', 'keep'));

      await expect(
        service.removeMany([valid.storagePath, '../../outside.txt']),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(await fs.readFile(path.join(root, 'outside.txt'), 'utf8')).toBe('outside');
    });
  });

  describe('sanitizeExt（拡張子の整形）', () => {
    it('大文字は小文字にそろえる', async () => {
      const { storagePath } = await service.save(1, makeFile('REPORT.PDF'));
      expect(storagePath.endsWith('.pdf')).toBe(true);
    });

    it.each<[string, string]>([
      // extname は最後のドット以降を拡張子として返すので、整形はその 1 段だけを見る。
      // Windows の extname は名前中の引用符を名前の終わりとして扱わないため、ここでも .js が残る。
      ['script.js"', '.js'],
      ['file.pdf.exe', '.exe'],
      ['file.tar.gz', '.gz'],
      ['file.p df', '.pdf'],
      ['file.1', '.1'],
      ['file.xlsx', '.xlsx'],
      ['file.a-b', '.ab'],
    ])(
      'ファイル名 %s の拡張子は %s として整形する（記号は落とす）',
      async (originalName, expectedExt) => {
        const { storagePath } = await service.save(1, makeFile(originalName));
        expect(path.extname(storagePath)).toBe(expectedExt);
        expect(path.basename(storagePath)).not.toMatch(/["\s]/);
      },
    );

    it('10 文字を超える拡張子は捨てる（名前の付け替えを防ぐ）', async () => {
      const { storagePath } = await service.save(1, makeFile('file.abcdefghijkl'));
      expect(path.extname(storagePath)).toBe('');
    });

    it('拡張子が無い名前は拡張子を付けない', async () => {
      const { storagePath } = await service.save(1, makeFile('README'));
      expect(path.extname(storagePath)).toBe('');
    });
  });

  describe('保存先の指定', () => {
    it('ANNOUNCEMENT_UPLOAD_DIR が無ければ作業ディレクトリ配下の既定の場所を保存先にする', async () => {
      delete process.env.ANNOUNCEMENT_UPLOAD_DIR;
      const fallback = new AnnouncementStorageService();
      const expectedBase = path.join(process.cwd(), 'var/uploads/announcements');
      const insideDir = path.join(expectedBase, 'spec-fallback');
      const probeName = path.join('spec-fallback', 'probe.txt');

      // 既定の場所が無い環境でも走らせられるよう、確かめた後に作った分だけ片付ける。
      const baseExisted = await fs
        .stat(expectedBase)
        .then(() => true)
        .catch(() => false);
      await fs.mkdir(insideDir, { recursive: true });
      await fs.writeFile(path.join(insideDir, 'probe.txt'), 'ok', 'utf8');

      try {
        await expect(readAll(fallback.createReadStream(probeName))).resolves.toBe('ok');
        await expectRejectedOutside(() =>
          readAll(fallback.createReadStream('../../../../outside-probe.txt')),
        );
      } finally {
        await fs.rm(insideDir, { recursive: true, force: true });
        if (!baseExisted) {
          await fs.rm(expectedBase, { recursive: true, force: true });
          // mkdir が作った中間ディレクトリ（var/ まで）も、元が無ければ残さない。
          await fs.rm(path.join(process.cwd(), 'var'), { recursive: true, force: true });
        }
      }
    });

    it('相対パスで指定されても、解決した場所を保存先の基準にする', async () => {
      const relativeBase = path.relative(process.cwd(), baseDir);
      process.env.ANNOUNCEMENT_UPLOAD_DIR = relativeBase;
      const relativeService = new AnnouncementStorageService();

      const { storagePath } = await relativeService.save(2, makeFile('doc.pdf'));

      expect(await fs.readFile(path.join(baseDir, storagePath), 'utf8')).toBe('body');
      await expectRejectedOutside(() =>
        readAll(
          relativeService.createReadStream(path.relative(baseDir, path.join(root, 'outside.txt'))),
        ),
      );
    });
  });
});
