-- Dashboard feature の追加 + permissions / system-parameters / dashboard を SYS_ADMIN 専用に縮退
--
-- 背景:
--   - permission matrix にダッシュボードを informational 行として並べる
--   - permissions / system-parameters / dashboard は SYS_ADMIN 以外は参照・編集させない
--
-- 注意:
--   - dashboard はリファレンス側で FeatureGuard を付けていない（informational only）。
--     matrix の dashboard.view OFF は実 redirect 制御に影響しない。
--   - 既存環境で WH_ADMIN / OF_ADMIN に permissions の CRUD 等が付与されていた場合、
--     本 migration で剥奪される（仕様確認済）。

-- 1) dashboard feature を全 role に対し追加。SYS_ADMIN のみ CRUD、他 role は NONE。
INSERT INTO "role_permissions" ("role", "feature_id", "can_view", "can_create", "can_update", "can_delete")
VALUES
  ('SYS_ADMIN', 'dashboard', TRUE,  TRUE,  TRUE,  TRUE),
  ('OF_ADMIN',  'dashboard', FALSE, FALSE, FALSE, FALSE),
  ('OF_USER',   'dashboard', FALSE, FALSE, FALSE, FALSE),
  ('WH_ADMIN',  'dashboard', FALSE, FALSE, FALSE, FALSE),
  ('WH_USER',   'dashboard', FALSE, FALSE, FALSE, FALSE)
ON CONFLICT ("role", "feature_id") DO NOTHING;

-- 2) permissions / system-parameters を SYS_ADMIN 以外で NONE に縮退。
UPDATE "role_permissions"
SET    "can_view" = FALSE,
       "can_create" = FALSE,
       "can_update" = FALSE,
       "can_delete" = FALSE
WHERE  "feature_id" IN ('permissions', 'system-parameters')
  AND  "role" <> 'SYS_ADMIN';
