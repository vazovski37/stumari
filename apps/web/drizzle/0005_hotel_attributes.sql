ALTER TABLE `hotels` ADD `description` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `neighborhood` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `amenities` text DEFAULT '[]' NOT NULL;