import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { T0 } from "@/test/db";
import { DEFAULT_HOTEL_POLICY } from "../db/schema";
import type { HotelRow, RoomTypeRow } from "../hotels";
import { termsText } from "./terms";
import { publicBookingView, type BookingRow } from "./view";

const GUEST_WALLET = base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(3)));
const CHECKIN = Date.UTC(2026, 9, 30, 10) / 1000; // Fri 30 Oct 2026, 14:00 Tbilisi
const STANDARD = [
  { secs_before: 604_800, refund_bps: 10_000 },
  { secs_before: 259_200, refund_bps: 5_000 },
  { secs_before: 0, refund_bps: 0 },
];

const hotel: HotelRow = {
  id: "eddc8112-235b-47bc-bc47-a02a46799267",
  slug: "test-hotel",
  name: "Test Guesthouse",
  city: "Tbilisi",
  country: "Georgia",
  address: "Sololaki",
  phone: "+995 555 000 000",
  timezone: "Asia/Tbilisi",
  checkin_time: "14:00",
  checkout_time: "12:00",
  hotel_type: "City Hotel",
  payout_wallet: "Hz15VSLNydDp49sLpWvsJ4dxvfEf2KYoecJL9wc4Y5wa",
  onchain_hotel: null,
  registered_sig: null,
  status: "active",
  policy: DEFAULT_HOTEL_POLICY,
  contact_email: "owner@hotel.example",
  contact_telegram: "@owner",
  application_id: null,
  created_at: T0,
  updated_at: T0,
};
const roomType = { id: "4eeaa42d-24bf-43e8-94f4-9111f1e044c6", name: "Double room" } as RoomTypeRow;

const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: "0123456789abcdef0123456789abcdef",
  quote_id: "q",
  option_index: 1,
  option_id: "standard",
  hotel_id: hotel.id,
  room_type_id: roomType.id,
  room_id: "unit",
  guest_wallet: GUEST_WALLET,
  guest_name: "Nino Beridze",
  guest_email: "nino@example.com",
  guest_phone: "+995 599 123 456",
  checkin_date: "2026-10-30",
  checkout_date: "2026-11-01",
  checkin_ts: CHECKIN,
  checkout_ts: CHECKIN + 2 * 86_400 - 7_200,
  amount_minor: "150000000",
  tiers: STANDARD,
  fee_bps: 0,
  hotel_authority: hotel.payout_wallet,
  booking_pda: "BookingPda111111111111111111111111111111111",
  vault: "Vau1t111111111111111111111111111111111111111",
  status: "confirmed",
  refund_minor: null,
  hotel_minor: null,
  fee_minor: null,
  create_sig: "5CreateSig",
  confirm_sig: "5ConfirmSig",
  final_sig: null,
  confirm_deadline_ts: T0 + 7_200,
  release_after_ts: CHECKIN + 120,
  created_at: T0,
  updated_at: T0,
  ...over,
});

const view = (b: BookingRow, now: number, cluster: "localnet" | "devnet" = "localnet") =>
  publicBookingView({ booking: b, hotel, roomType }, { now, cluster, rpcUrl: "http://127.0.0.1:8899" });

describe("public booking view", () => {
  it("never includes the guest's name, email, phone or wallet, nor hotel contact data", () => {
    for (const status of ["awaiting_signature", "pending", "confirmed", "cancelled", "released"] as const) {
      const text = JSON.stringify(view(booking({ status }), CHECKIN - 86_400));
      for (const secret of [GUEST_WALLET, "Nino", "nino@example.com", "599 123", hotel.payout_wallet!, "owner@hotel.example", "@owner"]) {
        expect(text, `${status} leaks ${secret}`).not.toContain(secret);
      }
    }
  });

  it("shows the refund by the tiers, also while pending (the cancel guarantees only the tier refund)", () => {
    const fiveDaysBefore = CHECKIN - 5 * 86_400;
    expect(view(booking(), fiveDaysBefore).refund_if_cancel_now_minor).toBe("75000000");
    expect(view(booking({ status: "pending" }), fiveDaysBefore).refund_if_cancel_now_minor).toBe("75000000");
    expect(view(booking(), CHECKIN - 60).refund_if_cancel_now_minor).toBe("0");
    const afterCheckin = view(booking(), CHECKIN);
    expect(afterCheckin).toMatchObject({ can_cancel: false, refund_if_cancel_now_minor: null });
  });

  it("promises only the cancel's min_refund: the tiers 90 s from now, so a boundary about to pass is not shown", () => {
    const sevenDays = CHECKIN - 604_800;
    const threeDays = CHECKIN - 259_200;
    // 30 s before a boundary the program would still pay the earlier tier, but a cancel built now
    // only guarantees the next one.
    expect(view(booking(), sevenDays - 30).refund_if_cancel_now_minor).toBe("75000000");
    expect(view(booking({ status: "pending" }), sevenDays - 30).refund_if_cancel_now_minor).toBe("75000000");
    expect(view(booking(), threeDays - 30).refund_if_cancel_now_minor).toBe("0");
    expect(view(booking(), sevenDays - 90).refund_if_cancel_now_minor).toBe("150000000");
    expect(view(booking(), sevenDays - 89).refund_if_cancel_now_minor).toBe("75000000");
    // The fee is only taken from the hotel's share; the refund is the tier share of the amount.
    expect(view(booking({ fee_bps: 150 }), sevenDays - 30).refund_if_cancel_now_minor).toBe("75000000");
  });

  it("carries the chain clock it was built at", () => {
    expect(view(booking(), CHECKIN - 1234).now).toBe(CHECKIN - 1234);
  });

  it("opens the dispute window from check-in until release, and void only after the confirm deadline", () => {
    expect(view(booking(), CHECKIN - 1).can_dispute).toBe(false);
    expect(view(booking(), CHECKIN).can_dispute).toBe(true);
    expect(view(booking(), CHECKIN + 120).can_dispute).toBe(false);
    expect(view(booking({ status: "pending" }), T0 + 7_199).can_void).toBe(false);
    expect(view(booking({ status: "pending" }), T0 + 7_200).can_void).toBe(true);
    expect(view(booking(), T0 + 7_200).can_void).toBe(false);
  });

  it("links the explorer on the right cluster", () => {
    const local = view(booking({ final_sig: "5FinalSig" }), T0);
    expect(local.explorer.booking).toBe(
      "https://explorer.solana.com/address/BookingPda111111111111111111111111111111111?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899",
    );
    expect(local.explorer.exit_tx).toContain("/tx/5FinalSig?cluster=custom");
    expect(view(booking(), T0, "devnet").explorer.create_tx).toBe("https://explorer.solana.com/tx/5CreateSig?cluster=devnet");
  });
});

describe("terms text", () => {
  it("states each refund step with hotel-local times", () => {
    const lines = termsText({ tiers: STANDARD, checkinTs: CHECKIN, releaseAfterTs: CHECKIN + 120, timeZone: "Asia/Tbilisi" });
    expect(lines[0]).toBe("Cancel before Fri 23 Oct 2026, 14:00: 100% refund.");
    expect(lines[1]).toBe("Cancel from Fri 23 Oct 2026, 14:00 until Tue 27 Oct 2026, 14:00: 50% refund.");
    expect(lines[2]).toBe("Cancel from Tue 27 Oct 2026, 14:00 until check-in (Fri 30 Oct 2026, 14:00): no refund.");
    expect(lines.some((l) => l.includes("dispute before Fri 30 Oct 2026, 14:02"))).toBe(true);
  });

  it("describes a single-tier schedule in one line", () => {
    const [first] = termsText({ tiers: [{ secs_before: 0, refund_bps: 0 }], checkinTs: CHECKIN, releaseAfterTs: null, timeZone: "Asia/Tbilisi" });
    expect(first).toBe("Cancel any time before check-in (Fri 30 Oct 2026, 14:00): no refund.");
  });
});
