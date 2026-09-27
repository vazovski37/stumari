/**
 * zod schemas for the parts of Connector API responses we read. Unknown fields are stripped;
 * Mews returns `null` for absent optional values, hence `.nullish()`.
 */
import { z } from "zod";

const LocalizedText = z.record(z.string(), z.string().nullable()).nullish();

export const ConfigurationResponse = z.object({
  NowUtc: z.string().nullish(),
  Enterprise: z.object({
    Id: z.string(),
    Name: z.string().nullish(),
    TimeZoneIdentifier: z.string(),
    Currencies: z
      .array(z.object({ Currency: z.string(), IsDefault: z.boolean().nullish(), IsEnabled: z.boolean().nullish() }))
      .nullish(),
  }),
});

export const Service = z.object({
  Id: z.string(),
  IsActive: z.boolean(),
  Name: z.string().nullish(),
  Names: LocalizedText,
  Ordering: z.number().nullish(),
  Data: z
    .object({
      Discriminator: z.string(),
      Value: z
        .object({
          StartOffset: z.string().nullish(),
          EndOffset: z.string().nullish(),
          TimeUnitPeriod: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
export const ServicesResponse = z.object({ Services: z.array(Service), Cursor: z.string().nullish() });

export const ResourceCategory = z.object({
  Id: z.string(),
  ServiceId: z.string(),
  IsActive: z.boolean(),
  Type: z.string().nullish(),
  Names: LocalizedText,
  ShortNames: LocalizedText,
  Ordering: z.number().nullish(),
  Capacity: z.number().nullish(),
  ExtraCapacity: z.number().nullish(),
});
export const ResourceCategoriesResponse = z.object({
  ResourceCategories: z.array(ResourceCategory),
  Cursor: z.string().nullish(),
});

export const Rate = z.object({
  Id: z.string(),
  ServiceId: z.string(),
  IsActive: z.boolean(),
  IsEnabled: z.boolean().nullish(),
  IsPublic: z.boolean().nullish(),
  IsDefault: z.boolean().nullish(),
  Type: z.string().nullish(),
  Name: z.string().nullish(),
  Names: LocalizedText,
  ShortName: z.string().nullish(),
});
export const RatesResponse = z.object({ Rates: z.array(Rate), Cursor: z.string().nullish() });

export const AgeCategory = z.object({
  Id: z.string(),
  ServiceId: z.string().nullish(),
  IsActive: z.boolean().nullish(),
  Classification: z.string().nullish(),
  MinimalAge: z.number().nullish(),
  MaximalAge: z.number().nullish(),
  Names: LocalizedText,
});
export const AgeCategoriesResponse = z.object({ AgeCategories: z.array(AgeCategory), Cursor: z.string().nullish() });

/** `services/getAvailability` (the pre-2024 version: absolute availability incl. adjustments). */
export const AvailabilityResponse = z.object({
  TimeUnitStartsUtc: z.array(z.string()),
  CategoryAvailabilities: z.array(z.object({ CategoryId: z.string(), Availabilities: z.array(z.number().int()) })),
});

/** `services/getAvailability/2024-01-22`. */
export const AvailabilityMetricsResponse = z.object({
  TimeUnitStartsUtc: z.array(z.string()),
  ResourceCategoryAvailabilities: z.array(
    z.object({
      ResourceCategoryId: z.string(),
      Metrics: z.record(z.string(), z.array(z.number().int())),
    }),
  ),
});

const Amount = z.object({
  Currency: z.string(),
  NetValue: z.number(),
  GrossValue: z.number(),
});
export const PriceResponse = z.object({
  ReservationPrices: z.array(z.object({ Identifier: z.string().nullish(), TotalAmount: Amount })).min(1),
});

export const CustomerAddResponse = z.object({ Id: z.string() });

export const ReservationsAddResponse = z.object({
  Reservations: z
    .array(
      z.object({
        Identifier: z.string().nullish(),
        Reservation: z.object({
          Id: z.string(),
          Number: z.string().nullish(),
          State: z.string(),
          StartUtc: z.string().nullish(),
          EndUtc: z.string().nullish(),
        }),
      }),
    )
    .min(1),
});

export const ReservationIdsResponse = z.object({ ReservationIds: z.array(z.string()) });

export const Reservation2023 = z.object({
  Id: z.string(),
  ServiceId: z.string(),
  Number: z.string().nullish(),
  State: z.string(),
  RequestedResourceCategoryId: z.string().nullish(),
  RateId: z.string().nullish(),
  AccountId: z.string().nullish(),
  ScheduledStartUtc: z.string().nullish(),
  ScheduledEndUtc: z.string().nullish(),
  CancelledUtc: z.string().nullish(),
  PersonCounts: z.array(z.object({ AgeCategoryId: z.string(), Count: z.number().int() })).nullish(),
});
export const ReservationsGetAllResponse = z.object({
  Reservations: z.array(Reservation2023),
  Cursor: z.string().nullish(),
});

export const ErrorBody = z.object({ Message: z.string().nullish(), RequestId: z.string().nullish() });

/** Picks a display name from a Mews localized-text dictionary (en-US, en-GB, any en-*, then first). */
export function pickName(
  names: Record<string, string | null> | null | undefined,
  fallback?: string | null,
): string {
  if (names) {
    const entries = Object.entries(names).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "");
    const by = (pred: (k: string) => boolean) => entries.find(([k]) => pred(k))?.[1];
    const found = by((k) => k === "en-US") ?? by((k) => k === "en-GB") ?? by((k) => k.startsWith("en")) ?? entries[0]?.[1];
    if (found) return found;
  }
  return fallback ?? "";
}
