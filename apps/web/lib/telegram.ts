import type { ApplicationInput } from "./applications";

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
