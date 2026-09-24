import "server-only";
import en from "@/messages/en.json";
import ka from "@/messages/ka.json";
import ru from "@/messages/ru.json";
import type { Locale } from "./locales";

/** English is the source; every other dictionary must have the same shape (checked at compile time). */
export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, ka, ru };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
