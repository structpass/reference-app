'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { isValidObjectTypeKey, objectTypePermissionId } from '@struct-pass/shared';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import {
  buildPresetNavItems,
  navCategories,
  type NavCategory,
} from '@/components/layout/nav-config';
import { fetchObjectTypesStrict } from '@/features/custom-ledger/lib/api';
import { subscribeObjectTypeCatalog } from '@/features/custom-ledger/lib/catalog-events';
import { resolveLedgerIcon } from '@/features/custom-ledger/lib/icons';

function NavCategorySection({
  category,
  canViewFn,
}: {
  category: NavCategory;
  canViewFn: (featureId: string) => boolean;
}) {
  const pathname = usePathname();

  const visibleItems = category.items.filter((item) => {
    if (!item.featureId) return true;
    return canViewFn(item.featureId);
  });

  const [open, setOpen] = useState(true);

  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-1">
      {/* ref-0041: 行を左右 6px 逃がす（mx-1.5）。<button> は width:auto が fit-content になるため
          w-full ではなく calc で余白ぶんを引いた幅を明示する（<a> の行は自動で埋まる）。 */}
      <button
        onClick={() => setOpen(!open)}
        className="sidebar-hover-row mx-1.5 flex w-[calc(100%-0.75rem)] items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground transition-colors"
      >
        {category.label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div>
          {visibleItems.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'sidebar-hover-row mx-1.5 flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'sidebar-row-active font-medium text-sidebar-foreground'
                    : 'text-sidebar-foreground/75 hover:text-sidebar-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  /** モバイル表示時にリンククリックでサイドバーを閉じるコールバック */
  onCloseMobile?: () => void;
}

// ref-0041: 選択中の行は帯の測位対象から外す（選択ピルが半透明の白＝下に帯が入ると透けて二重に
// 見える。rete cmn-0133 の各 rowSelector と同型）。測位と leave 判定で同じ定義を使う。
const ROW_SELECTOR = '.sidebar-hover-row:not(.sidebar-row-active)';

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const { canView } = usePermissions();
  const {
    listRef: navRef,
    onMouseOver: handleRowMouseOver,
    onMouseLeave: handleNavMouseLeave,
    bandStyle,
  } = useRowHoverBand<HTMLElement>(ROW_SELECTOR);

  // ref-0077: 自由定義の台帳（プリセット以外の種別）を描画時に左メニューへ足す。navCategories 自体は
  // 書き換えない（権限設定の機能一覧・ダッシュボード件数カードへ波及させない＝criteria 5）。取得前・
  // 失敗時・403 時は空配列のまま＝既存の静的な並びをそのまま出す（criteria 4）。
  const [presetItems, setPresetItems] = useState<NavCategory['items']>(() =>
    buildPresetNavItems([]),
  );
  const [customItems, setCustomItems] = useState<NavCategory['items']>([]);
  const mountedRef = useRef(true);

  // 左メニューは dashboard 共通レイアウトが保持するため、台帳の作成・編集後に一覧へ遷移しても
  // Sidebar は再 mount されない（初回取得の catalog を使い続ける＝新規台帳も編集結果も出ない）。
  // 取得処理を reloadCatalog へ切り出し、mount 時に加えて mutation 側の通知
  // （invalidateObjectTypeCatalog）でも回す。取得失敗時は空配列へ倒し、静的な並びをそのまま出す（criteria 4）。
  const reloadCatalog = useCallback(async (): Promise<void> => {
    const types = await fetchObjectTypesStrict().catch(() => []);
    if (!mountedRef.current) return;
    setPresetItems(buildPresetNavItems(types));
    const items = types
      .filter(
        (t) =>
          t &&
          !t.isPreset &&
          isValidObjectTypeKey(t.key) &&
          typeof t.name === 'string' &&
          t.name.trim().length > 0 &&
          Number.isFinite(t.sortOrder),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({
        href: `/dashboard/custom/${t.key}`,
        label: t.name,
        icon: resolveLedgerIcon(t.icon),
        // backendのcatalogが可視でも、frontendはkeyから導出したdynamic IDで再判定する。
        featureId: objectTypePermissionId(t.key),
      }));
    setCustomItems(items);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void reloadCatalog();
    const unsubscribe = subscribeObjectTypeCatalog(() => void reloadCatalog());
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [reloadCatalog]);

  // カテゴリ照合は表示ラベルでなく安定キー categoryKey で行う（ラベル変更で動的追加が消えない・
  // ref-0077 review）。navCategories 自体は書き換えず、描画時に items を足す（criteria 5）。
  const categories = navCategories.map((cat) =>
    cat.categoryKey === 'A'
      ? {
          ...cat,
          // presetはcatalogのmetadataを反映するが、users/groups等の既存static itemは温存する。
          items: [...presetItems, ...cat.items.filter((item) => !item.presetKey), ...customItems],
        }
      : cat,
  );

  // nav 内でも行（ROW_SELECTOR）にヒットしない領域（カテゴリ間の余白・選択中の行）へ入ったら帯を消す
  // （rete cmn-0127 app-sidebar.tsx の handleScrollMouseOver と同型）。
  const handleNavMouseOver = (e: ReactMouseEvent<HTMLElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR);
    if (!row || !navRef.current?.contains(row)) {
      handleNavMouseLeave();
      return;
    }
    handleRowMouseOver(e);
  };

  const handleNavClick = () => {
    onCloseMobile?.();
  };

  return (
    <aside
      className="sidebar-glass flex h-full w-[15.5rem] flex-col p-2.5 text-sidebar-foreground"
      onClick={handleNavClick}
    >
      {/* ヘッダ背景はガラスパネル（.sidebar-glass::before）を透かすため持たない（ref-0023）。
          縦 padding は rete .app-sidebar-header と同値（1.25rem 1rem = py-5 px-4）へ（ref-0028）。 */}
      {/* ref-0034: globals.css の .sidebar-glass .app-sidebar-header h1（rete cmn-0125 同値の
          上方光源グラデ）が DOM に効いていなかった（クラス欠落のドリフト）ため付与して実効化。 */}
      <div className="app-sidebar-header border-b border-sidebar-border px-4 py-5">
        {/* rete グローバルタブ（System）準拠の固定ラベル（ref-0024・サブタイトルは ref-0030 で撤去）。
            NEXT_PUBLIC_APP_NAME/SUBTITLE はログイン画面・<title> 用に残し、サイドバーでは参照しない。 */}
        <h1 className="font-semibold tracking-tight">System</h1>
      </div>
      {/* ref-0040 → ref-0041: 器の左右余白は持たない（旧 px-2 は撤去済み）。逃がしは器ではなく行側の
          mx-1.5（6px）が担い、ホバー帯（.sidebar-hoverband）も同じ 6px へ寄せてある＝アクティブピル・
          ホバー帯・rete の3つが揃う（rete も .app-sidebar-scroll は左右余白ゼロで行に margin-inline
          6px・cmn-0133）。行側 px-3 py-2 が rete .sidebar-link（0.5rem 0.75rem）と同値なのも据え置き。
          縦の pt-2/pb も据え置き。 */}
      <nav
        ref={navRef}
        className="scrollbar-hidden relative flex-1 space-y-1 overflow-y-auto pb-[6.6vh] pt-2"
        onMouseOver={handleNavMouseOver}
        onMouseLeave={handleNavMouseLeave}
      >
        {categories.map((cat) => (
          <NavCategorySection key={cat.label} category={cat} canViewFn={canView} />
        ))}
        {bandStyle ? <div aria-hidden className="sidebar-hoverband" style={bandStyle} /> : null}
      </nav>
    </aside>
  );
}
