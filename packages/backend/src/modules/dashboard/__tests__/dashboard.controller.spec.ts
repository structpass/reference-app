import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DashboardController } from '../dashboard.controller';
import { DashboardService } from '../dashboard.service';

// d808: DashboardController は spec を持っていなかった（Service と Repository だけが試験対象）。
// Home の件数は認証必須で、role を Service へ渡す経路がここにしかない。経路が切れると
// 「権限フィルタが効かず全件が返る」「role が undefined で渡る」のどちらも画面では
// 件数が出るだけで気付きにくいため、Controller の受け口を試験で固定する。
//
// TestingModule の compile() はガードを実行しないため、@UseGuards(JwtAuthGuard) を外しても
// 「Service を呼ぶ」試験は緑のままになる。認証配下であることは宣言そのものを見て固定する。
const mockService = {
  getCounts: jest.fn(),
};

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockService }],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  it('認証必須であること（JwtAuthGuard がコントローラーに宣言されている）', () => {
    // @UseGuards(JwtAuthGuard) を外すとこの試験が落ちる（compile() では検出できない分をここで受ける）。
    // Home の件数は全機能の登録件数を集計するため、未認証で読めると「誰が見ても全件」になる。
    const guards = Reflect.getMetadata(GUARDS_METADATA, DashboardController) as
      | Array<new (...args: never[]) => unknown>
      | undefined;

    expect(guards).toBeDefined();
    expect(guards).toContain(JwtAuthGuard);
  });

  it('認証済みユーザーの role をそのまま Service へ渡すこと', async () => {
    mockService.getCounts.mockResolvedValue({ success: true, data: { counts: [] } });

    await controller.getCounts(UserRole.WH_USER);

    expect(mockService.getCounts).toHaveBeenCalledWith(UserRole.WH_USER);
  });

  it('role が無い（null）時も Service を呼び、勝手に件数を返さないこと', async () => {
    mockService.getCounts.mockResolvedValue({ success: true, data: { counts: [] } });

    const result = await controller.getCounts(null);

    expect(mockService.getCounts).toHaveBeenCalledWith(null);
    expect(result).toEqual({ success: true, data: { counts: [] } });
  });

  it('Service の結果をそのまま返すこと（{ success, data: { counts } } の形を崩さない）', async () => {
    const response = {
      success: true as const,
      data: { counts: [{ featureId: 'products', count: 12 }] },
    };
    mockService.getCounts.mockResolvedValue(response);

    await expect(controller.getCounts(UserRole.SYS_ADMIN)).resolves.toEqual(response);
  });

  it('Service が例外を投げたら握り潰さずに伝播すること', async () => {
    mockService.getCounts.mockRejectedValue(new Error('permission resolution failed'));

    await expect(controller.getCounts(UserRole.SYS_ADMIN)).rejects.toThrow(
      'permission resolution failed',
    );
  });
});
