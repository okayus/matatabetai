CREATE TABLE `meal_link_previews` (
	`meal_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`description` text,
	`site_name` text,
	`image_r2_key` text,
	`fetched_at` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`meal_id`, `kind`),
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "meal_link_previews_kind_check" CHECK("meal_link_previews"."kind" IN ('recipe', 'shop')),
	CONSTRAINT "meal_link_previews_status_check" CHECK("meal_link_previews"."status" IN ('pending', 'ok', 'failed'))
);
