import { afterEach, describe, expect, it, vi } from "vitest";

/** A window whose localStorage throws on every access, like a browser with site data blocked. */
function blockedWindow(fbq: (...args: unknown[]) => void) {
  return {
    get localStorage(): Storage {
      throw new DOMException("blocked", "SecurityError");
    },
    fbq,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  };
}

describe("trackLead", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends Lead after an Accept made while storage is blocked (same snapshot as the banner)", async () => {
    const fbq = vi.fn();
    vi.stubGlobal("window", blockedWindow(fbq));
    const { setConsent, getConsentSnapshot } = await import("@/components/consent/use-consent");
    const { trackLead } = await import("./meta-pixel");

    trackLead("demo");
    expect(fbq).not.toHaveBeenCalled();

    setConsent("accepted");
    expect(getConsentSnapshot()).toBe("accepted");
    trackLead("demo");
    expect(fbq).toHaveBeenCalledExactlyOnceWith("track", "Lead", { content_name: "demo" });
  });

  it("sends nothing after Decline", async () => {
    const fbq = vi.fn();
    vi.stubGlobal("window", blockedWindow(fbq));
    const { setConsent } = await import("@/components/consent/use-consent");
    const { trackLead } = await import("./meta-pixel");
    setConsent("declined");
    trackLead("pilot");
    expect(fbq).not.toHaveBeenCalled();
  });
});
