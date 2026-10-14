'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-[var(--sp-text-warm)]">
          予期しないエラーが発生しました
        </h2>
        <p className="mb-6 text-sm text-[var(--sp-text-warm-mute)]">
          申し訳ありません。問題が解決しない場合は、管理者にお問い合わせください。
        </p>
        <Button onClick={reset}>再試行</Button>
      </div>
    </div>
  );
}
