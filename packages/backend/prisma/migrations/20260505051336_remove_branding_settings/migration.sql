-- branding 設定を build-time env に移行したため、DB に残った 2 行を削除する。
-- 参照: packages/frontend/.env.local.example の NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_SUBTITLE
DELETE FROM "system_parameters" WHERE "key" IN ('system.app_name', 'system.sub_title');
