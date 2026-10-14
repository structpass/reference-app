import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsRepository } from './permissions.repository';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  objectType: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('PermissionsRepository ObjectType permission lookup', () => {
  let repository: PermissionsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repository = module.get(PermissionsRepository);
    jest.clearAllMocks();
  });

  it('権限解決用にkey/isPresetだけをsortOrder順で取得する', async () => {
    mockPrisma.objectType.findMany.mockResolvedValue([]);

    await repository.findObjectTypesForPermissions();

    expect(mockPrisma.objectType.findMany).toHaveBeenCalledWith({
      select: { key: true, isPreset: true },
      orderBy: { sortOrder: 'asc' },
    });
  });

  it('key指定では権限解決に必要な存在情報だけを取得する', async () => {
    mockPrisma.objectType.findUnique.mockResolvedValue({ key: 'project', isPreset: false });

    await repository.findObjectTypeForPermission('project');

    expect(mockPrisma.objectType.findUnique).toHaveBeenCalledWith({
      where: { key: 'project' },
      select: { key: true, isPreset: true },
    });
  });
});
