import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface LoadFailedProps {
  message: string;
  onRetry: () => void;
  /** 再試行中は true。押せない状態にして連打（重複した再取得）を防ぐ。 */
  busy?: boolean;
}

/**
 * 読み取り失敗の表示と再試行。空データ（正常な 0 件・レコード不在）と同じ見た目にしないため、
 * 一覧の「データがありません」・編集の「見つかりません」とは別の文言で出し、再試行の導線を添える。
 * 一覧の共通カード（DataTableCard）と詳細・編集の画面の双方から使う。
 *
 * 再試行中は、読み直していることが画面から分かるようにする（d942）。押した直後に表示が
 * 失敗のまま止まって見えると、押せていないのか・取り直しているのかが区別できない。押せない
 * こと（ボタンの無効）だけでは、色が薄くなる程度で気付きにくい。
 *
 * 処理中の合図は、スピナー（装飾扱い）と「読み込み直しています…」の文言、aria-busy が担う。
 * この部品の外側は role="alert"（live region）なので、内側に別の live region を重ねない
 * （読み上げが二重になるか、aria-busy の間だけ抑止されて案内が届かなくなる）。
 */
export function LoadFailed({ message, onRetry, busy = false }: LoadFailedProps) {
  return (
    <div className="py-12 text-center" role="alert" aria-busy={busy}>
      <p className="mb-4 text-[var(--sp-text-warm-mute)]">{message}</p>
      {busy ? (
        // スピナーは飾り（aria-hidden）にする。この部品の外側は role="alert"（live region）
        // なので、その内側にもう 1 つ live region を重ねると読み上げが二重になるか、
        // aria-busy の間だけ抑止されて案内が届かなくなる。処理中であることは
        // 見える文言と aria-busy が伝える。
        <p className="mb-3 flex items-center justify-center gap-2 text-xs text-[var(--sp-text-warm-mute)]">
          <span aria-hidden="true" className="inline-flex">
            <Spinner className="h-4 w-4" />
          </span>
          読み込み直しています…
        </p>
      ) : null}
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
