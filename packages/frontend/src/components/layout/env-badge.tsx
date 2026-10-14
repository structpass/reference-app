'use client';

const ENV_CLASS: Record<string, string> = {
  development: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30',
  staging: 'bg-amber-500/15 text-amber-700 ring-amber-500/30',
  production: 'bg-rose-500/15 text-rose-700 ring-rose-500/30',
};

export function EnvBadge() {
  const env = process.env.NEXT_PUBLIC_APP_ENV;
  if (!env) return null;

  const cls = ENV_CLASS[env] ?? 'bg-muted text-foreground/70 ring-border';

  return (
    <span
      className={`inline-flex h-6 items-center rounded px-2 text-[10px] font-bold tracking-wider ring-1 ring-inset ${cls}`}
      aria-label={`実行環境: ${env}`}
      title={`実行環境: ${env}`}
    >
      {env}
    </span>
  );
}
