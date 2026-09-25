import { TEMPLATES, type Explain, type ExplainOption } from "@stumari/core";
import { formatUsdc } from "@/lib/money";

/**
 * Roving radiogroup keys (WAI-ARIA radio group): the option index an arrow key moves the
 * selection to, wrapping at both ends, or null for any other key.
 */
export function radioKeyTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  return null;
}

/** Why an option is missing from the menu, in the guest's words ("Why this price" drawer). */
export function withheldText(option: ExplainOption, explain: Explain, amountCapMinor: string | null): string {
  const name = TEMPLATES[option.id].name;
  switch (option.withheld) {
    case "duplicate_terms":
      return `${name} is not offered: this close to check-in it has the same refunds as ${TEMPLATES[option.same_as ?? explain.reference_template].name}.`;
    case "over_amount_cap":
      return amountCapMinor === null
        ? `${name} is not offered: its price is above the pilot limit per booking.`
        : `${name} is not offered: its price is above the pilot limit of ${formatUsdc(BigInt(amountCapMinor))} USDC per booking.`;
    default:
      return `${name} is not offered: its risk for this request is outside the hotel's price bounds.`;
  }
}

/** A next step for a quote or payment error the guest can act on, shown under its message. */
export function errorHint(code: string | null): string | null {
  if (code === "AMOUNT_CAP") return "During the pilot each booking has a price limit. Try a shorter stay or a smaller room.";
  return null;
}
