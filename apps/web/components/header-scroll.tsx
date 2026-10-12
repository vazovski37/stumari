"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The landing header floats transparent over the hero photo and turns solid once the page
 * scrolls (data-scrolled, styled in SiteHeader).
 */
export function HeaderScroll({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => el.toggleAttribute("data-scrolled", window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <header ref={ref} className={className}>
      {children}
    </header>
  );
}
