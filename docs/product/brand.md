# Brand

Adopted 2026-10-01 (ADR-0019); the landing was redesigned on 2026-10-12, and the logo master was replaced with the founders' high-resolution square file. It replaces the first identity (wine, amber and paper, a Literata serif and an arched-doorway mark).

## Logo

The logo is the lowercase wordmark **stumari**: heavy, wide, square-shouldered letters with a dotless `i`. The master is [`brand/logo-master.png`](brand/logo-master.png), a 1024 × 1024 square with the white wordmark centred on black. The founders supplied it (replaced 2026-10-12 with a higher-resolution file).

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
| `apps/web/public/brand/stumari-logo.svg`, `stumari-logo-1024.png` | The master composition: white wordmark centred on a black square. **Use this for the Colosseum logo field** |
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
| Display (landing, `.display`) | **Inter Tight** 300, tracking −0.045em, oversized; emphasis in 800 (`<strong>`) | **Google Sans** 400, emphasis 700, one size smaller in the hero | Landing headlines, big numbers |
| Display (app, `.headline`) | **Inter Tight** 800, tracking −0.035em | **Google Sans** 700 | Headlines on app and apply pages |
| Text | **Inter** 400–600 | **Google Sans** 400–700 | Body, UI |
| Label | **Martian Mono** 500, uppercase, small | Google Sans 600, sentence case | Eyebrows, chips, step numbers, figures in tables |

All of these are free on Google Fonts and loaded through `next/font` (`apps/web/app/fonts.ts`). Georgian pages (`html:lang(ka)`) put Google Sans first in every stack, so the Latin words inside a Georgian line ("USDC", "24") match it. Google Sans was chosen over Noto Sans Georgian and FiraGO on 2026-10-01 for its cleaner, more open Georgian letters. Its heaviest weight is 700, which suits Georgian headlines. Georgian labels drop the mono and the capitals, because Georgian has no case and mono spacing leaves gaps. Image routes cannot use variable fonts, so they bundle static subsets: Inter Tight 500/800 (Latin) for the OG image in `apps/web/app/_fonts/`, and Google Sans 400/700 (Latin, Cyrillic, Georgian, no GSUB table because satori cannot read its extension lookups) for the ad images in `apps/web/app/(site)/ads/_fonts/`. Licenses are kept alongside the fonts.

## Shape and layout

Redesigned 2026-10-12 after the founders' reference: a cinematic editorial landing (full-bleed photography, very light oversized type, frosted cards, slow motion).

- Buttons are pills. Fields keep 6 px corners. Landing photo cards and panels use 24–28 px corners (`.photo-card`, `rounded-[1.5rem]`). App cards keep 8 px.
- Light headlines against the heavy wordmark: on the landing, headings are Inter Tight 300, and only the emphasis is bold.
- Sections: black full-screen hero over a photo, then a white problem section with drifting tilted photo cards, a bento grid for "How it works", the white pricing section, trust cards on frosted glass over the night panorama, the pilot section with one oversized "0%", FAQ, and the black close. The footer ends with the wordmark set full width.
- Frosted glass (`.glass`) only over photography.
- Focus rings are 2 px ink on light sections and 2 px white inside `.on-dark` sections. A white panel inside a black band uses `.on-light`, which resets text, label and focus colours.

## Motion

All motion is decoration (`globals.css`, under `prefers-reduced-motion: no-preference`). Without JS or with reduced motion, the page renders complete and still.
- Hero: the photo opens from a rounded tile to full bleed (1.5 s), settles from a slow zoom, and the text and booking card rise in, staggered.
- Sections: `[data-reveal]` elements fade and rise into view. `RevealObserver` (`components/landing/reveal-observer.tsx`) adds the hidden state only after it runs, and shows anything already on screen at once.
- Floating photo cards drift against the scroll (`.drift`, CSS scroll timelines, ignored by browsers without them).
- Header: transparent over the hero, then solid black with blur after 24 px of scroll (`HeaderScroll`).

## Photography

Black-and-white only. The photos are converted with autocontrast and +12% contrast, then saved as progressive JPEG in `apps/web/public/landing/`, and `next/image` serves sized versions. They are free photos from Unsplash under the [Unsplash License](https://unsplash.com/license): commercial use is allowed and credit is not required, but we keep it here. They illustrate the city and guest rooms in general and must never be captioned as a pilot hotel.

| File | Photo | Photographer |
|---|---|---|
| `hero-narikala.jpg` | [Narikala over the old town at night](https://unsplash.com/photos/K_ZHR_uNY30) | Viktor Solomonik |
| `tbilisi-panorama.jpg` | [Tbilisi at night from above](https://unsplash.com/photos/3lIn100zAV4) | Viktor Solomonik |
| `alley.jpg` | [Lit alley with restaurants, Tbilisi](https://unsplash.com/photos/L4ME_R35PFw) | Dreamer Dude |
| `doorway.jpg` | [Street at night, Tbilisi](https://unsplash.com/photos/uscH9RVLmIo) | Sasha Kaunas |
| `room-gallery.jpg` | [Bedroom with a metal bed and artwork](https://unsplash.com/photos/XWgTzyymwj8) | Lori Payne |
| `room-lamp.jpg` | [Bedside lamp](https://unsplash.com/photos/dV-7TJl-x2Y) | ubeyonroad |
| `window-seat.jpg` | [Window with blinds](https://unsplash.com/photos/83WDiqgSS4Q) | Ivy Aralia Nizar |

## Where the brand appears

The landing and apply pages, the header and footer, the checkout, booking, dashboard and admin pages (through the shared tokens), the OG image, the favicon and apple icon, and the ad images at `/ads`. [facebook-kit.md](../sales/facebook-kit.md#2-profile-and-cover-images-the-landing-brand) uses the same files.
