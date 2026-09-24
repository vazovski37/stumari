/**
 * Off-chain tables, exactly as docs/architecture/data-model.md.
 * Timestamps are unix seconds; money is a decimal string of base units; JSON is TEXT.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { applicationRoles, cryptoAcceptance } from "../application-fields";
import { locales } from "../i18n/locales";

export const applicationStatuses = ["new", "contacted", "qualified", "pilot", "rejected"] as const;
export const contractTemplates = ["flexible", "standard", "nonrefundable"] as const;
export const bookingStatuses = [
  "awaiting_signature",
  "pending",
  "confirmed",
  "cancelled",
  "released",
  "disputed",
  "resolved",
  "voided",
  "failed",
] as const;
export const bookingEventTypes = [
  "created",
  "confirmed",
  "cancelled",
  "released",
  "disputed",
  "resolved",
  "voided",
  "sync_conflict",
  "failed",
] as const;
export const builtTxActions = ["create", "cancel", "dispute", "void"] as const;
export const rateBuckets = ["apply", "faucet", "quote", "pay", "tx", "nonce"] as const;

export type ContractTemplate = (typeof contractTemplates)[number];
export type RateBucket = (typeof rateBuckets)[number];

/** hotels.policy — bounds per pricing-and-risk-model.md §5. */
export type HotelPolicy = {
  reference_template: ContractTemplate;
  enabled_templates: ContractTemplate[];
  resale_bps: [number, number, number, number, number, number];
  min_mult_bps: number;
  max_mult_bps: number;
};

export const DEFAULT_HOTEL_POLICY: HotelPolicy = {
  reference_template: "standard",
  enabled_templates: ["flexible", "standard", "nonrefundable"],
  resale_bps: [9000, 8000, 6500, 4500, 2500, 1000],
  min_mult_bps: 8500,
  max_mult_bps: 13000,
};

/** One refund tier, exactly as written on-chain. */
export type Tier = { secs_before: number; refund_bps: number };

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    created_at: integer("created_at").notNull(),
    hotel_name: text("hotel_name").notNull(),
    city: text("city").notNull().default("Tbilisi"),
    rooms_count: integer("rooms_count"),
    contact_name: text("contact_name").notNull(),
    role: text("role", { enum: applicationRoles }),
    phone: text("phone"),
    email: text("email"),
    telegram: text("telegram"),
    channels: text("channels", { mode: "json" }).$type<string[]>().notNull().default([]),
    channel_manager: text("channel_manager"),
    has_ical: integer("has_ical", { mode: "boolean" }),
    ical_single_unit: integer("ical_single_unit", { mode: "boolean" }),
    accepts_crypto_today: text("accepts_crypto_today", { enum: cryptoAcceptance }),
    message: text("message"),
    locale: text("locale", { enum: locales }).notNull(),
    utm: text("utm", { mode: "json" }).$type<Record<string, string>>(),
    consent: integer("consent", { mode: "boolean" }).notNull(),
    ip_hash: text("ip_hash"),
    status: text("status", { enum: applicationStatuses }).notNull().default("new"),
    notes: text("notes"),
  },
  (t) => [index("applications_status_created_idx").on(t.status, t.created_at)],
);

export const hotels = sqliteTable("hotels", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country"),
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("Asia/Tbilisi"),
  checkin_time: text("checkin_time").notNull().default("14:00"),
  checkout_time: text("checkout_time").notNull().default("12:00"),
  hotel_type: text("hotel_type", { enum: ["City Hotel", "Resort Hotel"] }).notNull().default("City Hotel"),
  payout_wallet: text("payout_wallet"),
  onchain_hotel: text("onchain_hotel"),
  registered_sig: text("registered_sig"),
  status: text("status", { enum: ["draft", "active", "paused"] }).notNull().default("draft"),
  policy: text("policy", { mode: "json" }).$type<HotelPolicy>().notNull().default(DEFAULT_HOTEL_POLICY),
  contact_email: text("contact_email"),
  contact_telegram: text("contact_telegram"),
  application_id: text("application_id").references(() => applications.id),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export const roomTypes = sqliteTable(
  "room_types",
  {
    id: text("id").primaryKey(),
    hotel_id: text("hotel_id")
      .notNull()
      .references(() => hotels.id),
    name: text("name").notNull(),
    description: text("description"),
    max_adults: integer("max_adults").notNull().default(2),
    max_children: integer("max_children").notNull().default(0),
    base_rate_minor: text("base_rate_minor").notNull(),
    weekend_rate_minor: text("weekend_rate_minor"),
    meal: text("meal", { enum: ["BB", "HB", "FB", "SC"] }).notNull().default("BB"),
    photo_url: text("photo_url"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sort: integer("sort").notNull().default(0),
    created_at: integer("created_at").notNull(),
  },
  (t) => [index("room_types_hotel_idx").on(t.hotel_id)],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    room_type_id: text("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    label: text("label").notNull(),
    ical_import_urls: text("ical_import_urls", { mode: "json" }).$type<string[]>().notNull().default([]),
    export_token: text("export_token").notNull().unique(),
    last_synced_at: integer("last_synced_at"),
    sync_error: text("sync_error"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("rooms_room_type_idx").on(t.room_type_id)],
);

export const blocks = sqliteTable(
  "blocks",
  {
    id: text("id").primaryKey(),
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id),
    start_date: text("start_date").notNull(),
    end_date: text("end_date").notNull(),
    source: text("source", { enum: ["ical", "manual"] }).notNull(),
    feed_url: text("feed_url"),
    external_uid: text("external_uid"),
    summary: text("summary"),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    index("blocks_room_dates_idx").on(t.room_id, t.start_date, t.end_date),
    index("blocks_room_feed_idx").on(t.room_id, t.feed_url),
  ],
);

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    hotel_id: text("hotel_id")
      .notNull()
      .references(() => hotels.id),
    room_type_id: text("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id),
    checkin_date: text("checkin_date").notNull(),
    checkout_date: text("checkout_date").notNull(),
    body: text("body", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    signature: text("signature").notNull(),
    hash: text("hash").notNull(),
    explain: text("explain", { mode: "json" }).$type<Record<string, unknown>>(),
    booking_id: text("booking_id").notNull(),
    buyer_type: text("buyer_type", { enum: ["guest", "agent"] }).notNull().default("guest"),
    buyer_wallet: text("buyer_wallet"),
    client_id: text("client_id").notNull(),
    ip_hash: text("ip_hash"),
    status: text("status", { enum: ["active", "used", "expired"] }).notNull().default("active"),
    expires_at: integer("expires_at").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    index("quotes_room_status_idx").on(t.room_id, t.status, t.expires_at),
    index("quotes_client_status_idx").on(t.client_id, t.status),
    index("quotes_booking_idx").on(t.booking_id),
  ],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    quote_id: text("quote_id")
      .notNull()
      .references(() => quotes.id),
    option_index: integer("option_index").notNull(),
    option_id: text("option_id").notNull(),
    hotel_id: text("hotel_id")
      .notNull()
      .references(() => hotels.id),
    room_type_id: text("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id),
    guest_wallet: text("guest_wallet").notNull(),
    guest_name: text("guest_name"),
    guest_email: text("guest_email"),
    guest_phone: text("guest_phone"),
    checkin_date: text("checkin_date").notNull(),
    checkout_date: text("checkout_date").notNull(),
    checkin_ts: integer("checkin_ts").notNull(),
    checkout_ts: integer("checkout_ts").notNull(),
    amount_minor: text("amount_minor").notNull(),
    tiers: text("tiers", { mode: "json" }).$type<Tier[]>().notNull(),
    fee_bps: integer("fee_bps"),
    hotel_authority: text("hotel_authority"),
    booking_pda: text("booking_pda"),
    vault: text("vault"),
    status: text("status", { enum: bookingStatuses }).notNull().default("awaiting_signature"),
    refund_minor: text("refund_minor"),
    hotel_minor: text("hotel_minor"),
    fee_minor: text("fee_minor"),
    create_sig: text("create_sig"),
    confirm_sig: text("confirm_sig"),
    final_sig: text("final_sig"),
    confirm_deadline_ts: integer("confirm_deadline_ts"),
    release_after_ts: integer("release_after_ts"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("bookings_quote_idx").on(t.quote_id),
    index("bookings_room_status_idx").on(t.room_id, t.status),
    index("bookings_hotel_status_idx").on(t.hotel_id, t.status),
    index("bookings_guest_wallet_idx").on(t.guest_wallet),
  ],
);

export const bookingEvents = sqliteTable(
  "booking_events",
  {
    id: text("id").primaryKey(),
    booking_id: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    type: text("type", { enum: bookingEventTypes }).notNull(),
    sig: text("sig"),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    created_at: integer("created_at").notNull(),
  },
  (t) => [index("booking_events_booking_idx").on(t.booking_id, t.created_at)],
);

export const builtTxs = sqliteTable(
  "built_txs",
  {
    id: text("id").primaryKey(),
    booking_id: text("booking_id").notNull(),
    quote_id: text("quote_id"),
    action: text("action", { enum: builtTxActions }).notNull(),
    message_hash: text("message_hash").notNull(),
    tx_base64: text("tx_base64").notNull(),
    last_valid_block_height: integer("last_valid_block_height").notNull(),
    expires_at: integer("expires_at").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    index("built_txs_booking_action_idx").on(t.booking_id, t.action, t.expires_at),
    index("built_txs_message_hash_idx").on(t.message_hash),
  ],
);

export const rateEvents = sqliteTable(
  "rate_events",
  {
    id: text("id").primaryKey(),
    bucket: text("bucket", { enum: rateBuckets }).notNull(),
    key: text("key").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (t) => [index("rate_events_bucket_key_created_idx").on(t.bucket, t.key, t.created_at)],
);

export const authNonces = sqliteTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  wallet: text("wallet").notNull(),
  message: text("message").notNull(),
  created_at: integer("created_at").notNull(),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
});
