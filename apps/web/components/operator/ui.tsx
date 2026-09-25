import type { ReactNode } from "react";
import type { BookingStatus } from "@/lib/bookings/view";
import { formatUsdc } from "@/lib/money";

/** Server- and client-safe building blocks for the dashboard and the admin console. */

const STATUS_TONE: Record<BookingStatus, string> = {
  awaiting_signature: "bg-sand text-ink-soft",
  pending: "bg-amber-soft text-wine-deep",
  confirmed: "bg-vine-soft text-vine",
  cancelled: "bg-sand text-ink",
  released: "bg-vine-soft text-vine",
  disputed: "bg-clay/10 text-clay",
  resolved: "bg-sand text-ink",
  voided: "bg-sand text-ink",
  failed: "bg-clay/10 text-clay",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_TONE[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "plain"; children: ReactNode }) {
  const cls = { good: "bg-vine-soft text-vine", warn: "bg-amber-soft text-wine-deep", bad: "bg-clay/10 text-clay", plain: "bg-sand text-ink" }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{children}</span>;
}

export const usdc = (minor: string | bigint) => `${formatUsdc(BigInt(minor))} USDC`;

export function Section({ id, title, action, children }: { id?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="card space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id ? `${id}-title` : undefined} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay">
      {error}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-sand/70 px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;
}

/** Shown to a signed-in wallet that may not open this page. */
export function NotAllowed({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <div className="card space-y-3 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-2 text-ink-soft">{children}</div>
      </div>
    </div>
  );
}
