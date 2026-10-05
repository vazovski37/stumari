# Brand

Adopted 2026-10-01 (ADR-0019). It replaces the first identity (wine, amber and paper, a Literata serif and an arched-doorway mark).

## Logo

The logo is the lowercase wordmark **stumari**: heavy, wide, square-shouldered letters with a dotless `i`. The master is [`brand/logo-master.png`](brand/logo-master.png), a white wordmark on black, placed lower left. The founders supplied it.

Every logo file is generated from the master by `scripts/brand-logo.py`. Never redraw the logo or set it in a font. To change the logo, replace the master and rerun the script:

```bash
pip install pillow numpy potracer
python scripts/brand-logo.py
```

The script traces the master to vector paths and writes:

| Output | Use |
|---|---|
| `apps/web/components/brand-paths.ts` | The wordmark and `s` paths, used by `<Wordmark>`, `<LogoMark>`, the OG image and the ad images |
| `apps/web/app/icon.svg` | Favicon: the `s` from the wordmark, white on a black square |
| `apps/web/public/brand/stumari-wordmark.svg`, `…-white.svg` | Black and white wordmark on a transparent background |
| `apps/web/public/brand/stumari-logo.svg`, `stumari-logo-1024.png` | The master composition on a square: white wordmark lower left on black. **Use this for the Colosseum logo field** |
| `apps/web/public/brand/stumari-avatar-1024.png` | Wordmark centred and small enough to survive a circular crop. Use it for Facebook, X and Telegram profile pictures |
| `apps/web/public/brand/stumari-icon-512.png` | The `s` mark, for app icons and small squares |

Rules:
- Use only white on black or black on white. Never tint, outline, stretch or shadow the wordmark.
- Clear space around the wordmark is at least the height of its `s`.
- Minimum width is 72 px on screen.
- Use the `s` mark only where the wordmark cannot fit, such as a favicon or app icon.
- In running text the name is written "Stumari" (capital S). The lowercase form belongs to the logo only.

## Colour

Black and white carry the brand. Colour appears only where it means something: a refund or success, a warning, an error. Tokens live in `apps/web/app/globals.css`:

| Token | Value | Use |
|---|---|---|
| `paper` | `#ffffff` | Page background |
| `surface` | `#f4f4f4` | Alternate sections, chips, inset panels |
| `line` | `#e2e2e2` | Hairlines and borders |
| `ink` | `#0a0a0a` | Text (19.8:1 on paper) |
| `ink-soft` | `#565656` | Secondary text (7.3:1 on paper, 6.7:1 on surface) |
| `brand` / `brand-deep` | `#000000` / `#000000` | Brand black: buttons, links, active states, the black bands (hero, trust, closing CTA, footer) |
| `positive` / `positive-soft` | `#1d7a46` / `#e3f2e8` | Money returned or released, success (5.4:1) |
| `warn` / `warn-soft` | `#9a5b00` / `#fbefd6` | Pending and waiting states (5.4:1) |
| `danger` | `#b3261e` | Errors and failed states (6.5:1) |

On black, text is white at 100%, 70% or 55% opacity. Never put brand black text on a colour fill other than the `-soft` status fills.

## Type

| Role | Latin and Cyrillic | Georgian | Where |
|---|---|---|---|
| Display | **Inter Tight** 800, tracking −0.035em | **Google Sans** 700, tracking −0.015em, one size smaller in the hero | Headlines, big numbers |
| Text | **Inter** 400–600 | **Google Sans** 400–700 | Body, UI |
| Label | **Martian Mono** 500, uppercase, small | Google Sans 600, sentence case | Eyebrows, chips, step numbers, figures in tables |

All of these are free on Google Fonts and loaded through `next/font` (`apps/web/app/fonts.ts`). Georgian pages (`html:lang(ka)`) put Google Sans first in every stack, so the Latin words inside a Georgian line ("USDC", "24") match it. Google Sans was chosen over Noto Sans Georgian and FiraGO on 2026-10-01 for its cleaner, more open Georgian letters. Its heaviest weight is 700, which suits Georgian headlines. Georgian labels drop the mono and the capitals, because Georgian has no case and mono spacing leaves gaps. Image routes cannot use variable fonts, so they bundle static subsets: Inter Tight 500/800 (Latin) for the OG image in `apps/web/app/_fonts/`, and Google Sans 400/700 (Latin, Cyrillic, Georgian, no GSUB table because satori cannot read its extension lookups) for the ad images in `apps/web/app/(site)/ads/_fonts/`. Licenses are kept alongside the fonts.

## Shape and layout

- Corners are small: 6 px on buttons and fields, 8 px on cards. Nothing is pill-shaped except the language switcher.
- Use rules, not shadows: 1 px `line` borders, and 2 px `ink` rules above numbered or statistic items.
- The landing alternates black and white blocks: black hero, white sections, a black trust band, then a black close (CTA and footer). The footer ends with the wordmark set full width, an echo of the master's black field.
- Focus rings are 2 px ink on light sections and 2 px white inside `.on-dark` sections. A white panel inside a black band uses `.on-light`, which resets text, label and focus colours.

## Where the brand appears

The landing and apply pages, the header and footer, the checkout, booking, dashboard and admin pages (through the shared tokens), the OG image, the favicon and apple icon, and the ad images at `/ads`. [facebook-kit.md](../sales/facebook-kit.md#2-profile-and-cover-images-the-landing-brand) uses the same files.
