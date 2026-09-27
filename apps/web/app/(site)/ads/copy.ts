/**
 * Ad creative copy (Facebook / Instagram), EN / KA / RU. Every claim follows the landing page and
 * docs/sales/offer.md (ADR-0013): no promised demand or revenue, "target" never "keep" for expected
 * revenue, the dispute caveat next to the 24-hour payout, and the fee after 2026 next to the 0%.
 * No swapping or exchanging of tokens anywhere (Meta's crypto ad policy covers it): guests pay in USDC.
 * Checked by copy.test.ts.
 */
import type { Locale } from "@/lib/i18n/locales";

export const adVariants = ["usdc", "contracts", "founding"] as const;
export type AdVariant = (typeof adVariants)[number];

export const adFormats = {
  square: { width: 1080, height: 1080, suffix: "" },
  wide: { width: 1200, height: 630, suffix: "-wide" },
} as const;
export type AdFormat = keyof typeof adFormats;

type Common = { tag: string; cta: string; brand: string };
type UsdcCopy = { headline: string; accent: string; body: string };
type ContractsCopy = { headline: string; accent: string; stat: string; statNote: string };
type FoundingCopy = { headline: string; big: string; accent: string; bullets: string[] };

export type AdCopy = { common: Common; usdc: UsdcCopy; contracts: ContractsCopy; founding: FoundingCopy };

export const adCopy: Record<Locale, AdCopy> = {
  en: {
    common: {
      tag: "Tbilisi pilot",
      cta: "Book a 15-minute demo",
      brand: "Stablecoin checkout for independent hotels",
    },
    usdc: {
      headline: "Do some of your guests already pay in USDT?",
      accent: "Take USDC, with automatic refund rules.",
      body: "Guests pay in USDC into an escrow that holds your cancellation terms. Refunds follow the contract the guest chose, automatically. You are paid 24 hours after check-in, unless the guest opens a dispute.",
    },
    contracts: {
      headline: "One cancellation policy for every guest?",
      accent: "Offer Flexible, Standard and Non-refundable, each priced for that guest.",
      stat: "27% of ordinary bookings cancel",
      statNote: "37% overall, including no-shows and group blocks (Hotel Booking Demand, 119,390 bookings)",
    },
    founding: {
      headline: "First 10 Tbilisi hotels",
      big: "0%",
      accent: "Stumari fee until 31 December 2026. Then a flat 1.5% of what the hotel receives.",
      bullets: [
        "Paid in USDC to a wallet you control, 24 hours after check-in, unless the guest opens a dispute",
        "Per-booking limit of 1,500 USDC during the pilot",
        "No exclusivity, no minimums, leave anytime",
      ],
    },
  },
  ka: {
    common: {
      tag: "პილოტი თბილისში",
      cta: "დემოს დანიშვნა",
      brand: "სტეიბლქოინით გადახდა დამოუკიდებელი სასტუმროებისთვის",
    },
    usdc: {
      headline: "ზოგიერთი სტუმარი უკვე USDT-ით იხდის?",
      accent: "მიიღეთ USDC — თანხის დაბრუნების ავტომატური წესებით.",
      body: "სტუმარი იხდის USDC-ით ესქროუ ანგარიშზე, სადაც თქვენი გაუქმების პირობებია ჩაწერილი. თანხა ავტომატურად ბრუნდება სტუმრის არჩეული კონტრაქტით. თქვენ თანხას შესვლიდან 24 საათში იღებთ, თუ სტუმარი დავას არ გახსნის.",
    },
    contracts: {
      headline: "ყველა სტუმრისთვის ერთი გაუქმების წესი?",
      accent: "შესთავაზეთ მოქნილი, სტანდარტული და დაბრუნების გარეშე — თითოეული ამ სტუმრისთვის დათვლილი ფასით.",
      stat: "ჩვეულებრივი ჯავშნების 27% უქმდება",
      statNote: "საერთო ჯამში 37%, გამოუცხადებლობისა და ჯგუფური ბლოკების ჩათვლით (Hotel Booking Demand, 119\u00a0390 ჯავშანი)",
    },
    founding: {
      headline: "თბილისის პირველი 10 სასტუმრო",
      big: "0%",
      accent: "Stumari-ს საკომისიო 2026 წლის 31 დეკემბრამდე. შემდეგ — ფიქსირებული 1,5% იმ თანხიდან, რასაც სასტუმრო იღებს.",
      bullets: [
        "გადახდა USDC-ით თქვენს კონტროლქვეშ მყოფ საფულეში, შესვლიდან 24 საათში — თუ სტუმარი დავას არ გახსნის",
        "პილოტის განმავლობაში ერთი ჯავშნის ლიმიტი 1\u00a0500 USDC-ია",
        "ექსკლუზიურობისა და მინიმუმების გარეშე, წასვლა ნებისმიერ დროს",
      ],
    },
  },
  ru: {
    common: {
      tag: "Пилот в Тбилиси",
      cta: "Запишитесь на 15-минутное демо",
      brand: "Оплата в стейблкоинах для независимых отелей",
    },
    usdc: {
      headline: "Некоторые гости уже платят вам в USDT?",
      accent: "Принимайте USDC — с автоматическими правилами возврата.",
      body: "Гость платит в USDC на эскроу-счёт, в котором записаны ваши условия отмены. Возвраты идут автоматически по контракту, который выбрал гость. Деньги приходят вам через 24 часа после заезда, если гость не откроет спор.",
    },
    contracts: {
      headline: "Одно правило отмены для всех гостей?",
      accent: "Предлагайте Гибкий, Стандартный и Невозвратный — каждый по цене для этого гостя.",
      stat: "27% обычных бронирований отменяются",
      statNote: "37% в целом, с учётом неявок и групповых блоков (Hotel Booking Demand, 119\u00a0390 бронирований)",
    },
    founding: {
      headline: "Первые 10 отелей Тбилиси",
      big: "0%",
      accent: "комиссии Stumari до 31 декабря 2026 года. Затем — фиксированные 1,5% от суммы, которую получает отель.",
      bullets: [
        "Выплата в USDC на кошелёк, который контролируете вы, через 24 часа после заезда — если гость не откроет спор",
        "Лимит на одно бронирование во время пилота — 1\u00a0500 USDC",
        "Без эксклюзивности и минимальных объёмов, можно уйти в любой момент",
      ],
    },
  },
};

/** `usdc.png` → square, `usdc-wide.png` → 1200×630; null for anything else. */
export function parseAdFile(file: string): { variant: AdVariant; format: AdFormat } | null {
  const match = /^([a-z]+?)(-wide)?\.png$/.exec(file);
  if (!match) return null;
  const variant = adVariants.find((v) => v === match[1]);
  if (!variant) return null;
  return { variant, format: match[2] ? "wide" : "square" };
}

export function adFileName(variant: AdVariant, format: AdFormat): string {
  return `${variant}${adFormats[format].suffix}.png`;
}
