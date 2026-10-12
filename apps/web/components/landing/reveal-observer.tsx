"use client";

import { useEffect } from "react";

/**
 * Marks every `[data-reveal]` element "in" as it scrolls into view (globals.css animates it).
 * The hidden starting state only applies once this runs (html.reveal-ready), so the page is
 * complete without JS. Mount once per page.
 */
export function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal", "in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    const targets = document.querySelectorAll("[data-reveal]:not([data-reveal='in'])");
    // Anything already on screen shows at once, so nothing above the fold blinks out.
    for (const el of targets) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) el.setAttribute("data-reveal", "in");
      else observer.observe(el);
    }
    root.classList.add("reveal-ready");
    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);
  return null;
}
