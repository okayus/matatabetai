CREATE TABLE `meal_cooks` (
	`meal_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`meal_id`, `user_id`),
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
