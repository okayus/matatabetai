ALTER TABLE `meals` ADD `recipe_url` text;--> statement-breakpoint
ALTER TABLE `meals` ADD `shop_url` text;--> statement-breakpoint
-- 旧 RecipeSource（排他 DU）の backfill。url は「レシピ / 店 / 商品」を区別しない 1 本だったので
-- 一律 recipe_url に移す（ADR-007 §1）。凍結列は 'none' + NULL に戻して
-- meals_recipe_source_check を満たし続ける（recipe_source_type = 'url' の行は CHECK により
-- recipe_text が必ず NULL なので、更新後は 'none' の枝を満たす）
UPDATE `meals` SET `recipe_url` = `url`, `url` = NULL, `recipe_source_type` = 'none' WHERE `recipe_source_type` = 'url';
