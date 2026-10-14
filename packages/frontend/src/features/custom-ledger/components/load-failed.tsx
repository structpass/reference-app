import { Button } from '@/components/ui/button';

interface LoadFailedProps {
  message: string;
  onRetry: () => void;
  /** 再試行中は true。押せない状態にして連打（重複した再取得）を防ぐ。 */
  busy?: boolean;
}

/**
 * 読み取り失敗の表示と再試行。空データ（正常な 0 件・レコード不在）と同じ見た目にしないため、
 * 一覧の「データがありません」・編集の「見つかりません」とは別の文言で出し、再試行の導線を添える。
 */
export function LoadFailed({ message, onRetry, busy = false }: LoadFailedProps) {
  return (
    <div className="py-12 text-center" role="alert">
      <p className="mb-4 text-[var(--sp-text-warm-mute)]">{message}</p>
      <Button
        type="button"
        variant="sp-outline"
        size="sp-compact"
        onClick={onRetry}
        disabled={busy}
      >
        再試行
      </Button>
    </div>
  );
}
