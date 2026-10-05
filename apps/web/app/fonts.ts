import { Google_Sans, Inter, Inter_Tight, Martian_Mono } from "next/font/google";

// Latin + Cyrillic come from Inter (text), Inter Tight (display) and Martian Mono (labels). Georgian
// comes from Google Sans: Georgian pages set it first in every stack (globals.css) so a line never mixes
// two families; elsewhere it only fills Georgian glyphs. Not preloaded: browsers fetch it only for pages
// that use it. Brand rules: docs/product/brand.md.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin", "cyrillic"], variable: "--font-inter-tight", display: "swap" });
const martianMono = Martian_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-martian-mono", display: "swap" });
const googleSans = Google_Sans({
  subsets: ["latin", "georgian"],
  variable: "--font-google-sans",
  display: "swap",
  preload: false,
  // next/font has no fallback metrics for Google Sans yet (the build prints a harmless warning), so skip the fallback face.
  adjustFontFallback: false,
});

/** Class names that declare every font variable; put on <html>. */
export const fontVariables = [inter, interTight, martianMono, googleSans].map((font) => font.variable).join(" ");
