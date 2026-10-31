import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

const mockService = {
  getAttachmentConfig: jest.fn(),
  findMine: jest.fn(),
  findAllForManage: jest.fn(),
  findOneForManage: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  reorder: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  addAttachment: jest.fn(),
  downloadAttachment: jest.fn(),
  removeAttachment: jest.fn(),
};

describe('AnnouncementsController', () => {
  let controller: AnnouncementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [{ provide: AnnouncementsService, useValue: mockService }],
    }).compile();

    controller = module.get<AnnouncementsController>(AnnouncementsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('getConfig', () => {
    it('添付設定を ok envelope で返すこと', async () => {
      const config = { maxSizeMB: 10, maxFiles: 5, allowedExtensions: ['pdf'] };
      mockService.getAttachmentConfig.mockResolvedValue(config);

      const result = await controller.getConfig();

      expect(result).toEqual({ success: true, data: config });
    });
  });

  describe('findMine', () => {
    it('自ロール公開の掲示一覧を返すこと', async () => {
      const expected = { success: true, data: [] };
      mockService.findMine.mockResolvedValue(expected);

      const result = await controller.findMine('user-uuid');

      expect(result).toEqual(expected);
      expect(mockService.findMine).toHaveBeenCalledWith('user-uuid');
    });
  });

  describe('findAllForManage', () => {
    it('管理用全件を返すこと', async () => {
      const expected = { success: true, data: [] };
      mockService.findAllForManage.mockResolvedValue(expected);

      const result = await controller.findAllForManage();

      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('掲示詳細を返すこと（userId 引き渡し）', async () => {
      const expected = { success: true, data: { id: 1 } };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockService.findOne).toHaveBeenCalledWith(1, 'user-uuid');
    });
  });

  describe('create', () => {
    it('作成して返すこと', async () => {
      const dto = { title: 't', body: 'b', publishAt: new Date(), targetRoles: [] };
      const expected = { success: true, data: { id: 1 } };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockService.create).toHaveBeenCalledWith(dto, 'user-uuid');
    });
  });

  describe('reorder', () => {
    it('並び順更新を委譲すること', async () => {
      const dto = { items: [{ id: 1, sortOrder: 1 }] };
      const expected = { success: true, data: { message: 'reordered' } };
      mockService.reorder.mockResolvedValue(expected);

      const result = await controller.reorder(dto as any);

      expect(result).toEqual(expected);
      expect(mockService.reorder).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('更新を委譲すること（PUT）', async () => {
      const dto = { title: 'updated' };
      const expected = { success: true, data: { id: 1 } };
      mockService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockService.update).toHaveBeenCalledWith(1, dto, 'user-uuid');
    });
  });

  describe('remove', () => {
    it('削除を委譲すること', async () => {
      const expected = { success: true, data: { message: 'deleted' } };
      mockService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1);

      expect(result).toEqual(expected);
      expect(mockService.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('addAttachment', () => {
    it('Service に file と userId を渡すこと', async () => {
      const file = { originalname: 'a.pdf', mimetype: 'application/pdf' } as any;
      const expected = { success: true, data: { id: 1 } };
      mockService.addAttachment.mockResolvedValue(expected);

      const result = await controller.addAttachment(1, file, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockService.addAttachment).toHaveBeenCalledWith(1, file, 'user-uuid');
    });
  });

  describe('removeAttachment', () => {
    it('添付削除を委譲すること', async () => {
      const expected = { success: true, data: { message: 'removed' } };
      mockService.removeAttachment.mockResolvedValue(expected);

      const result = await controller.removeAttachment(1, 99);

      expect(result).toEqual(expected);
      expect(mockService.removeAttachment).toHaveBeenCalledWith(1, 99);
    });
  });

  describe('downloadAttachment', () => {
    it('管理者ロールでは isAdmin=true を渡すこと', async () => {
      const stream = { on: jest.fn() } as any;
      mockService.downloadAttachment.mockResolvedValue({
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        stream,
      });
      const setHeader = jest.fn();
      const res = { setHeader } as any;

      await controller.downloadAttachment(
        1,
        99,
        { id: 'user-uuid', role: UserRole.SYS_ADMIN },
        res,
      );

      expect(mockService.downloadAttachment).toHaveBeenCalledWith(1, 99, 'user-uuid', true);
      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    });

    it('非管理者では isAdmin=false を渡し、許可外 MIME は octet-stream に正規化すること', async () => {
      const stream = { on: jest.fn() } as any;
      mockService.downloadAttachment.mockResolvedValue({
        fileName: 'a.bin',
        mimeType: 'application/x-mystery',
        sizeBytes: 1,
        stream,
      });
      const setHeader = jest.fn();
      const res = { setHeader } as any;

      await controller.downloadAttachment(1, 99, { id: 'user-uuid', role: UserRole.OF_USER }, res);

      expect(mockService.downloadAttachment).toHaveBeenCalledWith(1, 99, 'user-uuid', false);
      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    // 2026-05-11: announcements 機能を SYS_ADMIN 固定運用に縮退した際の回帰検知。
    // WH_ADMIN / OF_ADMIN は以前 ADMIN_ROLES に含まれていたが、縮退後は isAdmin=false 扱いになる。
    it.each([
      ['WH_ADMIN', UserRole.WH_ADMIN],
      ['OF_ADMIN', UserRole.OF_ADMIN],
    ])('縮退後の %s は isAdmin=false を渡すこと', async (_label, role) => {
      const stream = { on: jest.fn() } as any;
      mockService.downloadAttachment.mockResolvedValue({
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        stream,
      });
      const setHeader = jest.fn();
      const res = { setHeader } as any;

      await controller.downloadAttachment(1, 99, { id: 'user-uuid', role }, res);

      expect(mockService.downloadAttachment).toHaveBeenCalledWith(1, 99, 'user-uuid', false);
    });
  });
});
