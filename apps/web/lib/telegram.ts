import type { ApplicationInput } from "./applications";
import { formatHotelDate, formatHotelTime } from "./bookings/terms";
import type { BookingRecord } from "./bookings/view";
import { formatUsdc } from "./money";

/** Plain-text summary of a new application for the founders' Telegram chat. */
export function applicationMessage(id: string, a: ApplicationInput): string {
  const lines = [
    `New pilot application: ${a.hotel_name} (${a.city})`,
    a.rooms_count !== null ? `Rooms: ${a.rooms_count}` : null,
    `Contact: ${a.contact_name} (${a.role})`,
    a.phone ? `Phone/WhatsApp: ${a.phone}` : null,
    a.telegram ? `Telegram: ${a.telegram}` : null,
    a.email ? `Email: ${a.email}` : null,
    a.channels.length > 0 ? `Channels: ${a.channels.join(", ")}` : null,
    `Locale: ${a.locale}`,
    `id: ${id}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/**
 * A paid booking at a manual-confirm hotel: someone checks the hotel's own system (e.g. its PMS),
 * enters the booking there, then presses Confirm before the deadline, or the guest is refunded.
 */
export function confirmRequestMessage(
  { booking: b, hotel, roomType }: BookingRecord,
  opts: { unitLabel: string | null; deadlineTs: number; siteUrl: string; conflict: boolean },
): string {
  const lines = [
    `Booking to confirm: ${hotel.name}`,
    `${roomType.name}${opts.unitLabel ? ` (unit ${opts.unitLabel})` : ""}: ${formatHotelDate(b.checkin_date)} → ${formatHotelDate(b.checkout_date)}`,
    `Paid: ${formatUsdc(BigInt(b.amount_minor))} USDC (${b.option_id})`,
    b.guest_name ? `Guest: ${b.guest_name}` : null,
    opts.conflict ? "Warning: Stumari's own calendar shows a conflict on these dates." : null,
    `1) Check the dates in the hotel's system and create the reservation there.`,
    `2) Confirm before ${formatHotelTime(opts.deadlineTs, hotel.timezone)} (${hotel.timezone}): ${opts.siteUrl}/dashboard/${hotel.id}`,
    `If the room is not free, don't confirm: the guest is refunded in full automatically after the deadline (an admin can void sooner).`,
    `Booking ${b.id}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** Sends a message via the Bot API. Best effort: never throws, gives up after 5 s. */
export async function notifyTelegram(config: { botToken: string; chatId: string }, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Notification is optional; the application is already stored.
  }
}
