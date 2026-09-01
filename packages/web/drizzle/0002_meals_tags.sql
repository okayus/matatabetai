CREATE TABLE `meal_tags` (
	`meal_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`meal_id`, `tag_id`),
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_tags_tag_id_idx` ON `meal_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`eaten_on` text NOT NULL,
	`meal_type` text,
	`recipe_source_type` text NOT NULL,
	`url` text,
	`recipe_text` text,
	`note` text,
	`mata_tabetai` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meals_recipe_source_check" CHECK(("meals"."recipe_source_type" = 'url' AND "meals"."url" IS NOT NULL AND "meals"."recipe_text" IS NULL) OR ("meals"."recipe_source_type" = 'text' AND "meals"."recipe_text" IS NOT NULL AND "meals"."url" IS NULL) OR ("meals"."recipe_source_type" = 'none' AND "meals"."url" IS NULL AND "meals"."recipe_text" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `meals_space_id_eaten_on_idx` ON `meals` (`space_id`,`eaten_on`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_space_id_name_normalized_uniq` ON `tags` (`space_id`,`name_normalized`);