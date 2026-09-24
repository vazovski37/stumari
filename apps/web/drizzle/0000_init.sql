CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`hotel_name` text NOT NULL,
	`city` text DEFAULT 'Tbilisi' NOT NULL,
	`rooms_count` integer,
	`contact_name` text NOT NULL,
	`role` text,
	`phone` text,
	`email` text,
	`telegram` text,
	`channels` text DEFAULT '[]' NOT NULL,
	`channel_manager` text,
	`has_ical` integer,
	`ical_single_unit` integer,
	`accepts_crypto_today` text,
	`message` text,
	`locale` text NOT NULL,
	`utm` text,
	`consent` integer NOT NULL,
	`ip_hash` text,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `applications_status_created_idx` ON `applications` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	`used` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`source` text NOT NULL,
	`feed_url` text,
	`external_uid` text,
	`summary` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blocks_room_dates_idx` ON `blocks` (`room_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `blocks_room_feed_idx` ON `blocks` (`room_id`,`feed_url`);--> statement-breakpoint
CREATE TABLE `booking_events` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`type` text NOT NULL,
	`sig` text,
	`data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_events_booking_idx` ON `booking_events` (`booking_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`option_index` integer NOT NULL,
	`option_id` text NOT NULL,
	`hotel_id` text NOT NULL,
	`room_type_id` text NOT NULL,
	`room_id` text NOT NULL,
	`guest_wallet` text NOT NULL,
	`guest_name` text,
	`guest_email` text,
	`guest_phone` text,
	`checkin_date` text NOT NULL,
	`checkout_date` text NOT NULL,
	`checkin_ts` integer NOT NULL,
	`checkout_ts` integer NOT NULL,
	`amount_minor` text NOT NULL,
	`tiers` text NOT NULL,
	`fee_bps` integer,
	`hotel_authority` text,
	`booking_pda` text,
	`vault` text,
	`status` text DEFAULT 'awaiting_signature' NOT NULL,
	`refund_minor` text,
	`hotel_minor` text,
	`fee_minor` text,
	`create_sig` text,
	`confirm_sig` text,
	`final_sig` text,
	`confirm_deadline_ts` integer,
	`release_after_ts` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_quote_idx` ON `bookings` (`quote_id`);--> statement-breakpoint
CREATE INDEX `bookings_room_status_idx` ON `bookings` (`room_id`,`status`);--> statement-breakpoint
CREATE INDEX `bookings_hotel_status_idx` ON `bookings` (`hotel_id`,`status`);--> statement-breakpoint
CREATE INDEX `bookings_guest_wallet_idx` ON `bookings` (`guest_wallet`);--> statement-breakpoint
CREATE TABLE `built_txs` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`quote_id` text,
	`action` text NOT NULL,
	`message_hash` text NOT NULL,
	`tx_base64` text NOT NULL,
	`last_valid_block_height` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `built_txs_booking_action_idx` ON `built_txs` (`booking_id`,`action`,`expires_at`);--> statement-breakpoint
CREATE INDEX `built_txs_message_hash_idx` ON `built_txs` (`message_hash`);--> statement-breakpoint
CREATE TABLE `hotels` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`country` text,
	`address` text,
	`phone` text,
	`timezone` text DEFAULT 'Asia/Tbilisi' NOT NULL,
	`checkin_time` text DEFAULT '14:00' NOT NULL,
	`checkout_time` text DEFAULT '12:00' NOT NULL,
	`hotel_type` text DEFAULT 'City Hotel' NOT NULL,
	`payout_wallet` text,
	`onchain_hotel` text,
	`registered_sig` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`policy` text DEFAULT '{"reference_template":"standard","enabled_templates":["flexible","standard","nonrefundable"],"resale_bps":[9000,8000,6500,4500,2500,1000],"min_mult_bps":8500,"max_mult_bps":13000}' NOT NULL,
	`contact_email` text,
	`contact_telegram` text,
	`application_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hotels_slug_unique` ON `hotels` (`slug`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`room_type_id` text NOT NULL,
	`room_id` text NOT NULL,
	`checkin_date` text NOT NULL,
	`checkout_date` text NOT NULL,
	`body` text NOT NULL,
	`signature` text NOT NULL,
	`hash` text NOT NULL,
	`explain` text,
	`booking_id` text NOT NULL,
	`buyer_type` text DEFAULT 'guest' NOT NULL,
	`buyer_wallet` text,
	`client_id` text NOT NULL,
	`ip_hash` text,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quotes_room_status_idx` ON `quotes` (`room_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `quotes_client_status_idx` ON `quotes` (`client_id`,`status`);--> statement-breakpoint
CREATE INDEX `quotes_booking_idx` ON `quotes` (`booking_id`);--> statement-breakpoint
CREATE TABLE `rate_events` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_events_bucket_key_created_idx` ON `rate_events` (`bucket`,`key`,`created_at`);--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`max_adults` integer DEFAULT 2 NOT NULL,
	`max_children` integer DEFAULT 0 NOT NULL,
	`base_rate_minor` text NOT NULL,
	`weekend_rate_minor` text,
	`meal` text DEFAULT 'BB' NOT NULL,
	`photo_url` text,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_types_hotel_idx` ON `room_types` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`label` text NOT NULL,
	`ical_import_urls` text DEFAULT '[]' NOT NULL,
	`export_token` text NOT NULL,
	`last_synced_at` integer,
	`sync_error` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_export_token_unique` ON `rooms` (`export_token`);--> statement-breakpoint
CREATE INDEX `rooms_room_type_idx` ON `rooms` (`room_type_id`);