/** Choice lists shared by the apply form, the API validator and the DB schema (dependency-free, safe for client bundles). */
export const applicationRoles = ["owner", "manager", "other"] as const;
export const cryptoAcceptance = ["no", "sometimes", "often"] as const;
/** Pilot pipeline stages (`applications.status`). */
export const applicationStatuses = ["new", "contacted", "qualified", "pilot", "rejected"] as const;
/** What the applicant asked for (`applications.intent`): the full pilot form or the short demo request. */
export const applicationIntents = ["pilot", "demo"] as const;
export const applicationChannels = ["booking.com", "airbnb", "expedia", "direct", "instagram", "other"] as const;

export type ApplicationRole = (typeof applicationRoles)[number];
export type CryptoAcceptance = (typeof cryptoAcceptance)[number];
export type ApplicationChannel = (typeof applicationChannels)[number];
export type ApplicationIntent = (typeof applicationIntents)[number];

/** Maps the apply page's `?type=` query value to an intent; anything else is the pilot form. */
export function intentFromQuery(value: string | string[] | undefined): ApplicationIntent {
  return value === "demo" ? "demo" : "pilot";
}

/** Name of the hidden field bots fill in; real browsers leave it empty. */
export const HONEYPOT_FIELD = "website";

/** Query parameters kept as source attribution (`applications.utm`). */
export const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"] as const;
