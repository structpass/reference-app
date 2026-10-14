import {
  Package,
  Warehouse,
  Truck,
  Building2,
  Tag,
  ClipboardCheck,
  FileCheck,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

/**
 * 台帳のアイコン文字列 → lucide コンポーネントの対応表（ref-0077）。
 * 未知・未設定は既定アイコンへ倒す（criteria 6）。
 */
const ICON_MAP: Record<string, LucideIcon> = {
  package: Package,
  warehouse: Warehouse,
  truck: Truck,
  building: Building2,
  tag: Tag,
  'clipboard-check': ClipboardCheck,
  'file-check': FileCheck,
  'clipboard-list': ClipboardList,
};

const DEFAULT_ICON: LucideIcon = ClipboardList;

export function resolveLedgerIcon(icon: string | null | undefined): LucideIcon {
  if (icon == null) return DEFAULT_ICON;
  return ICON_MAP[icon] ?? DEFAULT_ICON;
}
