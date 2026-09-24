import { Inter, Literata, Noto_Sans_Georgian, Noto_Serif_Georgian } from "next/font/google";

// Latin + Cyrillic come from Inter/Literata; Georgian glyphs fall through to the Noto families
// (the browser downloads them only for pages that contain Georgian text).
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const literata = Literata({ subsets: ["latin", "cyrillic"], variable: "--font-literata", display: "swap" });
const notoSansGeorgian = Noto_Sans_Georgian({
  subsets: ["georgian"],
  variable: "--font-noto-sans-georgian",
  display: "swap",
  preload: false,
});
const notoSerifGeorgian = Noto_Serif_Georgian({
  subsets: ["georgian"],
  variable: "--font-noto-serif-georgian",
  display: "swap",
  preload: false,
});

/** Class names that declare every font variable; put on <html>. */
export const fontVariables = [inter, literata, notoSansGeorgian, notoSerifGeorgian]
  .map((font) => font.variable)
  .join(" ");
