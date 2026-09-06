CREATE TABLE `meal_links` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`description` text,
	`site_name` text,
	`image_r2_key` text,
	`fetched_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "meal_links_kind_check" CHECK("meal_links"."kind" IN ('recipe', 'shop')),
	CONSTRAINT "meal_links_status_check" CHECK("meal_links"."status" IN ('pending', 'ok', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `meal_links_meal_id_idx` ON `meal_links` (`meal_id`);--> statement-breakpoint
-- backfill（ADR-010 §3）。既存表は書き換えず、新表へ写すだけ。
-- URL の出所は meals の凍結列（recipe_url / shop_url）で、カードは meal_link_previews から
-- 引き継ぐ。プレビュー表ができる前（0005 以前）の投稿には行が無いので status は 'failed' に
-- 倒す — ADR-007 §5 のとおり failed と行なしは同じ見え方（プレーンリンク）なので表示は変わらない。
-- id は SQLite だけで作る UUID v4（8-4-4-4-12。version は '4'、variant は 8/9/a/b）。
-- position は 1 投稿 1 本だった時代の値なので全部 0。
INSERT INTO `meal_links` (`id`, `meal_id`, `kind`, `position`, `url`, `status`, `title`, `description`, `site_name`, `image_r2_key`, `fetched_at`, `created_at`)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random() % 4) + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  m.`id`, 'recipe', 0, m.`recipe_url`,
  COALESCE(p.`status`, 'failed'), p.`title`, p.`description`, p.`site_name`, p.`image_r2_key`, p.`fetched_at`, m.`created_at`
FROM `meals` m LEFT JOIN `meal_link_previews` p ON p.`meal_id` = m.`id` AND p.`kind` = 'recipe'
WHERE m.`recipe_url` IS NOT NULL;--> statement-breakpoint
INSERT INTO `meal_links` (`id`, `meal_id`, `kind`, `position`, `url`, `status`, `title`, `description`, `site_name`, `image_r2_key`, `fetched_at`, `created_at`)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random() % 4) + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  m.`id`, 'shop', 0, m.`shop_url`,
  COALESCE(p.`status`, 'failed'), p.`title`, p.`description`, p.`site_name`, p.`image_r2_key`, p.`fetched_at`, m.`created_at`
FROM `meals` m LEFT JOIN `meal_link_previews` p ON p.`meal_id` = m.`id` AND p.`kind` = 'shop'
WHERE m.`shop_url` IS NOT NULL;
