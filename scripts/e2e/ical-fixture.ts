/**
 * A local stand-in for a Booking.com/Airbnb iCal export: one calendar on 127.0.0.1 whose events the
 * test swaps between syncs (the web app reads it only with ICAL_ALLOW_LOOPBACK, localnet only).
 */
import { createServer } from "node:http";

export interface FixtureEvent {
  uid: string;
  /** YYYY-MM-DD, DTEND exclusive. */
  start: string;
  end: string;
}

const icsDate = (date: string) => date.replaceAll("-", "");

function calendar(events: FixtureEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stumari E2E//OTA fixture//EN"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      "DTSTAMP:20260101T000000Z",
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(e.end)}`,
      "SUMMARY:CLOSED - Not available",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export interface IcalFixture {
  url: string;
  setEvents(events: FixtureEvent[]): void;
  close(): Promise<void>;
}

export async function startIcalFixture(): Promise<IcalFixture> {
  let events: FixtureEvent[] = [];
  const server = createServer((req, res) => {
    if (req.url !== "/ota.ics") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/calendar; charset=utf-8" }).end(calendar(events));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/ota.ics`,
    setEvents: (next) => {
      events = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
