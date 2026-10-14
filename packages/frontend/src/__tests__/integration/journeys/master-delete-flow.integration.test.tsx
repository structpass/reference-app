import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { apiPath } from '../_helpers/api-base';
import {
  masterListHandler,
  masterDeleteHandler,
  defaultCarriers,
} from '../../mocks/handlers/masters.handlers';
import CarriersPage from '@/app/dashboard/carriers/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

/**
 * Journey: master entity の削除確認フロー
 *
 * 1. list 取得で行が描画される
 * 2. 行の削除ボタン → 確認 dialog 表示
 * 3. dialog の「削除」を押下 → DELETE API 呼び出し
 * 4. onSuccess で reload → 削除後の最新 list が再描画される
 *
 * useDeleteConfirm + useListPage + DELETE API + ConfirmDialog の統合動作を検証する。
 */
describe('Master delete flow (journey)', () => {
  it('行削除 → 確認 → DELETE → reload で行が消える', async () => {
    const user = userEvent.setup();
    let deleteCalls = 0;

    // 初期: 2件 → DELETE 後: 1件 を返す list handler を切り替える
    server.use(
      masterListHandler('/carriers', defaultCarriers),
      http.delete(apiPath('/carriers/:id'), () => {
        deleteCalls += 1;
        // DELETE 成功後の list を 1 件に差し替える
        server.use(
          masterListHandler(
            '/carriers',
            defaultCarriers.filter((c) => c.id !== 1),
          ),
          masterDeleteHandler('/carriers'),
        );
        return HttpResponse.json({ data: { success: true } });
      }),
    );

    render(<CarriersPage />);

    await waitFor(() => {
      expect(screen.getByText('C-001')).toBeInTheDocument();
      expect(screen.getByText('C-002')).toBeInTheDocument();
    });

    // 削除ボタン: aria-label="削除" の icon button
    const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
    const rowDeleteBtn = deleteButtons.find((b) => b.querySelector('.lucide-trash2'));
    expect(rowDeleteBtn).toBeDefined();
    await user.click(rowDeleteBtn!);

    // 確認 dialog
    await waitFor(() => {
      expect(screen.getByText(/運送会社を削除/)).toBeInTheDocument();
    });

    // dialog 内の「削除」確定ボタン
    const confirmBtn = screen
      .getAllByRole('button', { name: /^削除$/ })
      .find((b) => b.closest('[role="alertdialog"]') || b.closest('[role="dialog"]'));
    expect(confirmBtn).toBeDefined();
    await user.click(confirmBtn!);

    // DELETE 呼び出し + 削除後 reload で C-001 が消える
    await waitFor(() => {
      expect(deleteCalls).toBe(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('C-001')).not.toBeInTheDocument();
      expect(screen.getByText('C-002')).toBeInTheDocument();
    });
  });
});
