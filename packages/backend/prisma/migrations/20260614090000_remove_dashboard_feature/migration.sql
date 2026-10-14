-- dashboard feature の撤去（Rete の Home へ移植済のため reference では obsolete）
--
-- 背景:
--   - サイドバーメニューから「ダッシュボード」項目を削除（struct-pass-reference-dashboard-0004/0005）
--   - nav-config が permission matrix の SSOT のため、feature_id 'dashboard' は frontend/backend/shared から除去済
--   - 既存環境に残る role_permissions の 'dashboard' 行を物理削除し、孤立データを掃除する
--
-- 注意:
--   - 20260513020242 で追加した dashboard 行（全 role）を本 migration で削除する
--   - `/dashboard` ルート自体は認証済みホームとして存続（メニューリンクと権限機能のみ撤去）

DELETE FROM "role_permissions" WHERE "feature_id" = 'dashboard';
