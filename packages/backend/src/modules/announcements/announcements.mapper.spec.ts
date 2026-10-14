import {
  makeAnnouncementEntity,
  makeAnnouncementAttachmentEntity,
  BASE_DATE,
} from '../../__tests__/factories';
import type {
  AnnouncementResponse,
  AnnouncementListItem,
  AnnouncementAttachmentResponse,
} from '@struct-pass/shared';
import {
  toAnnouncementListItem,
  toAnnouncementAttachmentResponse,
  toAnnouncementResponse,
  type AnnouncementListItemPayload,
} from './announcements.mapper';
import type {
  AnnouncementResponseDto,
  AnnouncementListItemDto,
  AnnouncementAttachmentResponseDto,
} from './dto/announcement-response.dto';

describe('announcements.mapper', () => {
  describe('toAnnouncementListItem', () => {
    it('List item 用の shape を保つ', () => {
      const entity: AnnouncementListItemPayload = {
        id: 1,
        title: 'Hello',
        bodyMarkdown: '# Body',
        isNew: false,
        isImportant: false,
        notifiedAt: BASE_DATE,
        sortOrder: 0,
      };
      const dto = toAnnouncementListItem(entity);
      expect(dto).toMatchObject({
        id: 1,
        title: 'Hello',
        bodyMarkdown: '# Body',
        isNew: false,
        isImportant: false,
        sortOrder: 0,
      });
      expect(dto.notifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('toAnnouncementAttachmentResponse', () => {
    it('storagePath を含めずに返すこと (内部パス漏洩防止)', () => {
      const entity = makeAnnouncementAttachmentEntity({ storagePath: 'secret/path/uuid.pdf' });
      const dto = toAnnouncementAttachmentResponse(entity);
      expect(dto).not.toHaveProperty('storagePath');
      expect(dto).toMatchObject({
        id: 1,
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdById: null,
      });
    });

    it('createdById を含めて返すこと（監査トレース）', () => {
      const entity = makeAnnouncementAttachmentEntity({ createdById: 'user-7' });
      const dto = toAnnouncementAttachmentResponse(entity);
      expect(dto.createdById).toBe('user-7');
    });
  });

  describe('toAnnouncementResponse', () => {
    it('Announcement DTO の主要 shape を保つ（roles / attachments / creator / updater 整形）', () => {
      const dto = toAnnouncementResponse(makeAnnouncementEntity());
      expect(dto).toMatchObject({
        id: 10,
        title: 'メンテナンスのお知らせ',
        bodyMarkdown: '# 本文',
        isNew: true,
        isImportant: false,
        sortOrder: -5,
        createdBy: 'user-1',
        updatedBy: 'user-2',
        creator: { id: 'user-1', name: 'alice' },
        updater: { id: 'user-2', name: 'bob' },
      });
      expect(dto.roles).toEqual([{ groupId: 100, groupCode: 'G-100', groupName: '倉庫管理者' }]);
    });

    it('添付を sortOrder 昇順で並べ直すこと', () => {
      const dto = toAnnouncementResponse(makeAnnouncementEntity());
      expect(dto.attachments.map((a) => a.id)).toEqual([1, 2]);
    });

    it('updater が null のとき updatedBy / updater も null になること', () => {
      const dto = toAnnouncementResponse(
        makeAnnouncementEntity({ updater: null, updatedById: null }),
      );
      expect(dto.updatedBy).toBeNull();
      expect(dto.updater).toBeNull();
    });

    it('attachments の storagePath はレスポンスに含まれない (規約 §1 DTO 境界)', () => {
      const dto = toAnnouncementResponse(makeAnnouncementEntity());
      expect(dto.attachments[0]).not.toHaveProperty('storagePath');
    });
  });

  describe('shared 型とのミラー同期 (N7)', () => {
    // JSON 化後の backend DTO 型（Date → string）。shared 型と一致していれば
    // backend DTO ↔ shared 型のミラーがドリフトしていないことを型で保証できる。
    type Serialized<T> = T extends Date
      ? string
      : T extends (infer U)[]
        ? Serialized<U>[]
        : T extends object
          ? { [K in keyof T]: Serialized<T[K]> }
          : T;

    // 双方向代入可能 + キー集合一致（optional キーの脱落は代入可能性では検知できないため両方見る）
    type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    type SameKeys<A, B> = [Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>] extends [never]
      ? true
      : false;
    type Mirrors<Dto, Shared> =
      MutuallyAssignable<Serialized<Dto>, Shared> extends true ? SameKeys<Dto, Shared> : false;

    // 型レベル検証: ミラーが崩れるとここがコンパイルエラーになる
    const responseMirrors: Mirrors<AnnouncementResponseDto, AnnouncementResponse> = true;
    const listItemMirrors: Mirrors<AnnouncementListItemDto, AnnouncementListItem> = true;
    const attachmentMirrors: Mirrors<
      AnnouncementAttachmentResponseDto,
      AnnouncementAttachmentResponse
    > = true;

    const serialize = <T>(value: T): Serialized<T> =>
      JSON.parse(JSON.stringify(value)) as Serialized<T>;

    it('型レベルミラー検証が成立していること', () => {
      expect(responseMirrors).toBe(true);
      expect(listItemMirrors).toBe(true);
      expect(attachmentMirrors).toBe(true);
    });

    it('toAnnouncementResponse の JSON 化出力が AnnouncementResponse shape と一致すること', () => {
      const json: AnnouncementResponse = serialize(
        toAnnouncementResponse(makeAnnouncementEntity()),
      );
      expect(Object.keys(json).sort()).toEqual([
        'attachments',
        'bodyMarkdown',
        'createdAt',
        'createdBy',
        'creator',
        'id',
        'isImportant',
        'isNew',
        'notifiedAt',
        'roles',
        'sortOrder',
        'title',
        'updatedAt',
        'updatedBy',
        'updater',
      ]);
      expect(typeof json.notifiedAt).toBe('string');
      expect(typeof json.createdAt).toBe('string');
      expect(typeof json.updatedAt).toBe('string');
    });

    it('toAnnouncementListItem の JSON 化出力が AnnouncementListItem shape と一致すること', () => {
      const entity: AnnouncementListItemPayload = {
        id: 1,
        title: 'Hello',
        bodyMarkdown: '# Body',
        isNew: false,
        isImportant: false,
        notifiedAt: BASE_DATE,
        sortOrder: 0,
      };
      const json: AnnouncementListItem = serialize(toAnnouncementListItem(entity));
      expect(Object.keys(json).sort()).toEqual([
        'bodyMarkdown',
        'id',
        'isImportant',
        'isNew',
        'notifiedAt',
        'sortOrder',
        'title',
      ]);
      expect(typeof json.notifiedAt).toBe('string');
    });

    it('toAnnouncementAttachmentResponse の JSON 化出力が AnnouncementAttachmentResponse shape と一致すること', () => {
      const json: AnnouncementAttachmentResponse = serialize(
        toAnnouncementAttachmentResponse(makeAnnouncementAttachmentEntity()),
      );
      expect(Object.keys(json).sort()).toEqual([
        'createdAt',
        'createdById',
        'fileName',
        'id',
        'mimeType',
        'sizeBytes',
      ]);
      expect(typeof json.createdAt).toBe('string');
    });
  });
});
