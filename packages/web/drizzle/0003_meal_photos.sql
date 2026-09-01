CREATE TABLE `meal_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`thumb_key` text,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meal_photos_meal_id_idx` ON `meal_photos` (`meal_id`);