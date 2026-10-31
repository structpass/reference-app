'use client';

interface PageHeaderProps {
  title: string;
  /** タイトル直後（右隣）に表示する小要素。お気に入り☆等を想定 */
  titleAfter?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, titleAfter, actions }: PageHeaderProps) {
  const titleNode = (
    <h1 className="text-xl font-semibold tracking-tight text-[var(--sp-text-warm)]">{title}</h1>
  );

  return (
    <div className="mb-3 flex items-center justify-between gap-6">
      {titleAfter ? (
        <div className="flex items-center gap-1">
          {titleNode}
          {titleAfter}
        </div>
      ) : (
        titleNode
      )}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
