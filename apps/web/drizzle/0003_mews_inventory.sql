ALTER TABLE `bookings` ADD `mews_customer_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `mews_reservation_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `mews_cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `mews_lock_until` integer;--> statement-breakpoint
ALTER TABLE `hotels` ADD `inventory_provider` text DEFAULT 'ical' NOT NULL;--> statement-breakpoint
ALTER TABLE `hotels` ADD `mews_service_id` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `mews_rate_id` text;--> statement-breakpoint
ALTER TABLE `room_types` ADD `mews_room_type_id` text;