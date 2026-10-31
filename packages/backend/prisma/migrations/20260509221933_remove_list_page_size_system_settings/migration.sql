-- list.default_page_size / list.page_size_options は per-tableId 化に伴い廃止。
-- 値の引き継ぎは行わない（table_pagination_settings 側で per-tableId のデフォルトを seed 済み）。
DELETE FROM "system_parameters"
WHERE "key" IN ('list.default_page_size', 'list.page_size_options');
