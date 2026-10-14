'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-[var(--sp-text-warm)]">
          画面の読み込みに失敗しました
        </h2>
        <p className="mb-6 text-sm text-[var(--sp-text-warm-mute)]">
          データの取得中にエラーが発生しました。再試行するか、ダッシュボードに戻ってください。
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            ダッシュボードへ
          </Button>
          <Button onClick={reset}>再試行</Button>
        </div>
      </div>
    </div>
  );
}
