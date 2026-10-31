import { redirect } from 'next/navigation';

/**
 * 旧ダッシュボードのトップ（掲示板/在庫アラート）は撤去済み（dashboard-0001/0006）。
 * 着地は /home に一本化したため、素の /dashboard は /home へ恒久リダイレクトする
 * （ブックマーク・直叩き対策）。業務機能ページは /dashboard/* に従来どおり存続。
 */
export default function DashboardIndexPage() {
  redirect('/home');
}
