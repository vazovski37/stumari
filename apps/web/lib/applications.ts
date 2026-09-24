import { z } from "zod";
import {
  applicationChannels,
  applicationRoles,
  cryptoAcceptance,
  HONEYPOT_FIELD,
  utmKeys,
} from "./application-fields";
import { locales } from "./i18n/locales";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

/** Yes / no / not sure — `null` means "not sure". */
const triState = z.boolean().nullish().transform((v) => v ?? null);

export const applicationInput = z
  .object({
    hotel_name: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(80).default("Tbilisi"),
    rooms_count: z.number().int().min(1).max(1000).nullish().transform((v) => v ?? null),
    contact_name: z.string().trim().min(1).max(120),
    role: z.enum(applicationRoles),
    phone: optionalText(40).refine((v) => v === null || /^\+?[0-9 ()-]{6,40}$/.test(v), {
      message: "Use digits, spaces and an optional leading +",
    }),
    email: optionalText(200).pipe(z.email().nullable()),
    telegram: optionalText(64).refine((v) => v === null || /^@?[A-Za-z0-9_]{4,32}$/.test(v), {
      message: "Use your Telegram @username",
    }),
    channels: z
      .array(z.enum(applicationChannels))
      .max(applicationChannels.length)
      .default([])
      .transform((list) => [...new Set(list)]),
    channel_manager: optionalText(80),
    has_ical: triState,
    ical_single_unit: triState,
    accepts_crypto_today: z.enum(cryptoAcceptance).nullish().transform((v) => v ?? null),
    message: optionalText(2000),
    locale: z.enum(locales),
    utm: z
      .partialRecord(z.enum(utmKeys), z.string().trim().max(200))
      .nullish()
      .transform((v) => (v && Object.keys(v).length > 0 ? (v as Record<string, string>) : null)),
    consent: z.literal(true, { message: "Consent is required" }),
  })
  .refine((a) => a.phone !== null || a.telegram !== null, {
    message: "Add a WhatsApp phone number or a Telegram username",
    path: ["phone"],
  });

export type ApplicationInput = z.output<typeof applicationInput>;

/** True when the request body filled the honeypot field (treated as spam, silently accepted). */
export function isHoneypotFilled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof value === "string" ? value.trim() !== "" : value !== undefined && value !== null;
}

/** Flattens zod issues into `{ path, message }` pairs for the API error body. */
export function describeIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}
