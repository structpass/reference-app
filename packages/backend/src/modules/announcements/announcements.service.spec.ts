import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsRepository } from './repositories/announcements.repository';
import { AnnouncementStorageService } from './storage/announcement-storage.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { makeAnnouncementEntity } from '../../__tests__/factories';

const mockRepo = {
  findUserGroupIds: jest.fn(),
  findExistingGroupIds: jest.fn(),
  findManyVisibleToGroups: jest.fn(),
  findManyAll: jest.fn(),
  findByIdWithRelations: jest.fn(),
  findMinSortOrder: jest.fn(),
  create: jest.fn(),
  existsById: jest.fn(),
  update: jest.fn(),
  reorder: jest.fn(),
  delete: jest.fn(),
  findAttachmentById: jest.fn(),
  countAttachmentsOf: jest.fn(),
  createAttachment: jest.fn(),
  deleteAttachment: jest.fn(),
};

const mockStorage = {
  save: jest.fn(),
  createReadStream: jest.fn(),
  remove: jest.fn(),
  removeMany: jest.fn(),
};

const mockSystemSettings = {
  getValue: jest.fn(),
};

// T4: entity の直書きを廃し、共通 factory（makeAnnouncementEntity）に集約する
// （architecture-invariants §3 / §5）。可視性テストは roles を override で与える。
function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'doc.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1000,
    buffer: Buffer.from('dummy'),
    stream: undefined as unknown as Express.Multer.File['stream'],
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: AnnouncementsRepository, useValue: mockRepo },
        { provide: AnnouncementStorageService, useValue: mockStorage },
        { provide: SystemSettingsService, useValue: mockSystemSettings },
      ],
    }).compile();
    service = module.get<AnnouncementsService>(AnnouncementsService);
    jest.clearAllMocks();
  });

  describe('findOne (可視性)', () => {
    it('404: 該当なし', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(null);
      await expect(service.findOne(1, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('ロール未設定の announcement は全ユーザーに可視', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(makeAnnouncementEntity({ roles: [] }));
      mockRepo.findUserGroupIds.mockResolvedValue([]);
      const res = await service.findOne(1, 'u1');
      expect(res.success).toBe(true);
    });

    it('ロール指定あり + ユーザーのグループが重複しない → NotFound（不在と同じ応答）', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(
        makeAnnouncementEntity({
          roles: [{ announcementId: 1, groupId: 100, group: { id: 100, code: 'A', name: 'A' } }],
        }),
      );
      mockRepo.findUserGroupIds.mockResolvedValue([200]);
      await expect(service.findOne(1, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('可視でない掲示と存在しない掲示の応答が揃う（文言まで同じ）', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValueOnce(
        makeAnnouncementEntity({
          roles: [{ announcementId: 1, groupId: 100, group: { id: 100, code: 'A', name: 'A' } }],
        }),
      );
      mockRepo.findUserGroupIds.mockResolvedValue([200]);
      const invisible = await service.findOne(1, 'u1').catch((e: Error) => e);

      mockRepo.findByIdWithRelations.mockResolvedValueOnce(null);
      const missing = await service.findOne(999, 'u1').catch((e: Error) => e);

      expect(invisible).toBeInstanceOf(NotFoundException);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect((invisible as NotFoundException).getStatus()).toBe(
        (missing as NotFoundException).getStatus(),
      );
      expect((invisible as NotFoundException).message).toBe((missing as NotFoundException).message);
    });

    it('ロール指定あり + ユーザーのグループが重複する → OK', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(
        makeAnnouncementEntity({
          roles: [{ announcementId: 1, groupId: 100, group: { id: 100, code: 'A', name: 'A' } }],
        }),
      );
      mockRepo.findUserGroupIds.mockResolvedValue([100]);
      const res = await service.findOne(1, 'u1');
      expect(res.success).toBe(true);
    });

    it('存在しない掲示でも所属グループを引く（不在と非可視でクエリ数を揃える）', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(null);
      mockRepo.findUserGroupIds.mockResolvedValue([]);

      await expect(service.findOne(999, 'u1')).rejects.toThrow(NotFoundException);

      expect(mockRepo.findUserGroupIds).toHaveBeenCalledWith('u1');
    });
  });

  describe('create', () => {
    it('sortOrder = minSortOrder - 1 で作成 (最新が先頭)', async () => {
      mockRepo.findMinSortOrder.mockResolvedValue(-3);
      mockRepo.create.mockResolvedValue(makeAnnouncementEntity({ sortOrder: -4 }));
      await service.create(
        { title: 't', bodyMarkdown: '', isNew: false, roleGroupIds: [] } as any,
        'u1',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: -4, createdById: 'u1' }),
        [],
      );
    });

    it('初回作成時は sortOrder = -1', async () => {
      mockRepo.findMinSortOrder.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeAnnouncementEntity({ sortOrder: -1 }));
      await service.create(
        { title: 't', bodyMarkdown: '', isNew: false, roleGroupIds: [] } as any,
        'u1',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: -1 }), []);
    });

    // v2-429: 存在しない宛先 id は外部キー違反（500）にせず、書き込む前に 400 で拒否する。
    it('存在しない宛先グループ id は 400 VALIDATION_ERROR で拒否し、不足 id を details に載せる', async () => {
      mockRepo.findExistingGroupIds.mockResolvedValue([3]);

      const error = await service
        .create(
          {
            title: 't',
            bodyMarkdown: '',
            isNew: false,
            roleGroupIds: [3, 999999],
          } as CreateAnnouncementDto,
          'u1',
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { missingRoleGroupIds: [999999] },
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('有効な宛先グループ id は存在確認を通って作成される', async () => {
      mockRepo.findExistingGroupIds.mockResolvedValue([3, 4]);
      mockRepo.findMinSortOrder.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeAnnouncementEntity());

      await service.create(
        {
          title: 't',
          bodyMarkdown: '',
          isNew: false,
          roleGroupIds: [3, 4],
        } as CreateAnnouncementDto,
        'u1',
      );

      expect(mockRepo.findExistingGroupIds).toHaveBeenCalledWith([3, 4]);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdById: 'u1' }),
        [3, 4],
      );
    });

    it('宛先が空の時は存在確認のクエリを発行しない（全員可視の仕様を変えない）', async () => {
      mockRepo.findMinSortOrder.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeAnnouncementEntity());

      await service.create(
        { title: 't', bodyMarkdown: '', isNew: false, roleGroupIds: [] } as CreateAnnouncementDto,
        'u1',
      );

      expect(mockRepo.findExistingGroupIds).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalledWith(expect.anything(), []);
    });

    // 独立レビュー指摘（int4 範囲外）: 範囲外の id も同じ 400 の形で返し、500 にしない。
    it('int4 の範囲外の宛先 id も 400 で拒否し、不足 id として返す', async () => {
      mockRepo.findExistingGroupIds.mockResolvedValue([]);

      const error = await service
        .create(
          {
            title: 't',
            bodyMarkdown: '',
            isNew: false,
            roleGroupIds: [2147483648],
          } as CreateAnnouncementDto,
          'u1',
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { missingRoleGroupIds: [2147483648] },
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update (宛先の入れ替え)', () => {
    it('存在しない宛先グループ id への入れ替えは 400 で拒否し、更新を実行しない', async () => {
      mockRepo.existsById.mockResolvedValue(true);
      mockRepo.findExistingGroupIds.mockResolvedValue([]);

      const error = await service
        .update(10, { roleGroupIds: [999999] } as UpdateAnnouncementDto, 'u1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { missingRoleGroupIds: [999999] },
      });
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('宛先の指定が無い更新は存在確認をせず、有効な宛先の入れ替えは通る', async () => {
      mockRepo.existsById.mockResolvedValue(true);
      mockRepo.update.mockResolvedValue(makeAnnouncementEntity());

      await service.update(10, { title: 't' } as UpdateAnnouncementDto, 'u1');
      expect(mockRepo.findExistingGroupIds).not.toHaveBeenCalled();

      mockRepo.findExistingGroupIds.mockResolvedValue([3]);
      await service.update(10, { roleGroupIds: [3] } as UpdateAnnouncementDto, 'u1');

      expect(mockRepo.findExistingGroupIds).toHaveBeenCalledWith([3]);
      expect(mockRepo.update).toHaveBeenCalledWith(10, expect.anything(), [3]);
    });
  });

  describe('reorder', () => {
    it('ID 重複があれば BadRequest', async () => {
      await expect(
        service.reorder({
          items: [
            { id: 1, sortOrder: 0 },
            { id: 1, sortOrder: 1 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAttachmentConfig', () => {
    beforeEach(() => {
      mockSystemSettings.getValue.mockImplementation((_key: string, def: string) =>
        Promise.resolve(def),
      );
    });

    it('デフォルト値 20MB / 4 files を返す', async () => {
      const cfg = await service.getAttachmentConfig();
      expect(cfg.maxSizeMB).toBe(20);
      expect(cfg.maxFiles).toBe(4);
      expect(cfg.allowedExtensions).toContain('pdf');
    });

    it('maxSizeMB は ABSOLUTE_MAX (500MB) を超えない', async () => {
      mockSystemSettings.getValue.mockImplementation((key: string) => {
        if (key === 'announcement.attachment.maxSizeMB') return Promise.resolve('9999');
        return Promise.resolve('');
      });
      const cfg = await service.getAttachmentConfig();
      expect(cfg.maxSizeMB).toBe(500);
    });

    it('ブロック拡張子 (exe) は allowedExtensions から除外される', async () => {
      mockSystemSettings.getValue.mockImplementation((key: string) => {
        if (key === 'announcement.attachment.allowedExtensions')
          return Promise.resolve('pdf,exe,bat,png');
        return Promise.resolve('');
      });
      const cfg = await service.getAttachmentConfig();
      expect(cfg.allowedExtensions).toEqual(expect.arrayContaining(['pdf', 'png']));
      expect(cfg.allowedExtensions).not.toContain('exe');
      expect(cfg.allowedExtensions).not.toContain('bat');
    });
  });

  describe('addAttachment', () => {
    beforeEach(() => {
      mockSystemSettings.getValue.mockImplementation((_key: string, def: string) =>
        Promise.resolve(def),
      );
      mockRepo.existsById.mockResolvedValue(true);
      mockRepo.countAttachmentsOf.mockResolvedValue(0);
    });

    it('announcement が無ければ NotFound', async () => {
      mockRepo.existsById.mockResolvedValue(false);
      await expect(service.addAttachment(1, makeFile(), 'u1')).rejects.toThrow(NotFoundException);
    });

    it('添付数が maxFiles 以上なら BadRequest', async () => {
      mockRepo.countAttachmentsOf.mockResolvedValue(4);
      await expect(service.addAttachment(1, makeFile(), 'u1')).rejects.toThrow(BadRequestException);
    });

    it('ブロック拡張子 (.exe) は BadRequest', async () => {
      await expect(
        service.addAttachment(1, makeFile({ originalname: 'virus.exe' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('拡張子なしファイルは BadRequest（BLOCKED_EXTENSIONS bypass 対策）', async () => {
      await expect(
        service.addAttachment(1, makeFile({ originalname: 'README' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('末尾ドットファイル名は BadRequest', async () => {
      await expect(
        service.addAttachment(1, makeFile({ originalname: 'foo.' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allowedExtensions に無い拡張子は BadRequest', async () => {
      await expect(
        service.addAttachment(1, makeFile({ originalname: 'foo.unknown' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('サイズ上限超過は BadRequest', async () => {
      mockSystemSettings.getValue.mockImplementation((key: string, def: string) => {
        if (key === 'announcement.attachment.maxSizeMB') return Promise.resolve('1');
        return Promise.resolve(def);
      });
      await expect(
        service.addAttachment(1, makeFile({ size: 2 * 1024 * 1024 }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('createAttachment に userId を createdById として渡すこと（監査証跡）', async () => {
      mockStorage.save.mockResolvedValue({ storagePath: '1/doc.pdf' });
      mockRepo.createAttachment.mockResolvedValue({
        id: 99,
        announcementId: 1,
        fileName: 'doc.pdf',
        storagePath: '1/doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        sortOrder: 0,
        createdById: 'u1',
        createdAt: new Date(),
      });
      await service.addAttachment(1, makeFile(), 'u1');
      expect(mockRepo.createAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ createdById: 'u1' }),
      );
    });
  });

  describe('downloadAttachment', () => {
    it('Admin は可視性チェックをスキップ', async () => {
      mockRepo.findAttachmentById.mockResolvedValue({
        id: 5,
        announcementId: 1,
        storagePath: '1/x.pdf',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        sortOrder: 0,
        createdAt: new Date(),
      });
      mockStorage.createReadStream.mockReturnValue({ pipe: jest.fn() });
      const res = await service.downloadAttachment(1, 5, 'u1', true);
      expect(res.fileName).toBe('x.pdf');
      expect(mockRepo.findByIdWithRelations).not.toHaveBeenCalled();
    });

    it('添付 ID と announcementId が食い違えば NotFound', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(makeAnnouncementEntity({ roles: [] }));
      mockRepo.findAttachmentById.mockResolvedValue({
        id: 5,
        announcementId: 99,
        storagePath: '',
        fileName: '',
        mimeType: '',
        sizeBytes: 0,
        sortOrder: 0,
        createdAt: new Date(),
      });
      await expect(service.downloadAttachment(1, 5, 'u1', false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('可視でない掲示の添付は、存在しない掲示の添付と同じ NotFound になる', async () => {
      mockRepo.findByIdWithRelations.mockResolvedValue(
        makeAnnouncementEntity({
          roles: [{ announcementId: 1, groupId: 100, group: { id: 100, code: 'A', name: 'A' } }],
        }),
      );
      mockRepo.findUserGroupIds.mockResolvedValue([200]);
      mockRepo.findAttachmentById.mockResolvedValue({
        id: 5,
        announcementId: 1,
        storagePath: '1/x.pdf',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        sortOrder: 0,
        createdAt: new Date(),
      });
      const invisible = await service.downloadAttachment(1, 5, 'u1', false).catch((e: Error) => e);

      mockRepo.findByIdWithRelations.mockResolvedValue(null);
      const missing = await service.downloadAttachment(999, 5, 'u1', false).catch((e: Error) => e);

      expect(invisible).toBeInstanceOf(NotFoundException);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect((invisible as NotFoundException).getStatus()).toBe(
        (missing as NotFoundException).getStatus(),
      );
      expect((invisible as NotFoundException).message).toBe((missing as NotFoundException).message);
    });
  });
});
