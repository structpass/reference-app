import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { promises as fs, createReadStream, type ReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

export interface StoredAttachmentFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredAttachmentResult {
  storagePath: string;
}

@Injectable()
export class AnnouncementStorageService {
  private readonly baseDir: string;

  constructor() {
    const configured = process.env.ANNOUNCEMENT_UPLOAD_DIR;
    this.baseDir = configured
      ? path.resolve(configured)
      : path.resolve(process.cwd(), 'var/uploads/announcements');
  }

  private getAnnouncementDir(announcementId: number): string {
    return path.join(this.baseDir, String(announcementId));
  }

  private resolveSafe(storagePath: string): string {
    const absolute = path.resolve(this.baseDir, storagePath);
    const normalizedBase = path.resolve(this.baseDir) + path.sep;
    if (!absolute.startsWith(normalizedBase) && absolute !== path.resolve(this.baseDir)) {
      throw new InternalServerErrorException('Invalid storage path');
    }
    return absolute;
  }

  async save(announcementId: number, file: StoredAttachmentFile): Promise<StoredAttachmentResult> {
    const dir = this.getAnnouncementDir(announcementId);
    await fs.mkdir(dir, { recursive: true });

    const ext = this.sanitizeExt(path.extname(file.originalName));
    const uniqueName = `${randomUUID()}${ext}`;
    const absolute = path.join(dir, uniqueName);
    const relative = path.relative(this.baseDir, absolute);

    this.resolveSafe(relative);

    await fs.writeFile(absolute, file.buffer);
    return { storagePath: relative.split(path.sep).join('/') };
  }

  createReadStream(storagePath: string): ReadStream {
    const absolute = this.resolveSafe(storagePath);
    return createReadStream(absolute);
  }

  async remove(storagePath: string): Promise<void> {
    const absolute = this.resolveSafe(storagePath);
    await fs.rm(absolute, { force: true });
  }

  async removeMany(storagePaths: string[]): Promise<void> {
    await Promise.all(storagePaths.map((p) => this.remove(p)));
  }

  private sanitizeExt(ext: string): string {
    const trimmed = ext.toLowerCase().replace(/[^.a-z0-9]/g, '');
    return trimmed.length > 10 ? '' : trimmed;
  }
}
