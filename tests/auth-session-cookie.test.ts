import { describe, it, expect } from "vitest";

import { hasSessionCookie } from "@/lib/auth/session-cookie";

describe("hasSessionCookie", () => {
  it("détecte le cookie de prod (__Secure-authjs.session-token)", () => {
    expect(hasSessionCookie(["__Secure-authjs.session-token"])).toBe(true);
  });

  it("détecte le cookie de dev (authjs.session-token)", () => {
    expect(hasSessionCookie(["authjs.session-token"])).toBe(true);
  });

  it("retourne false sans aucun cookie", () => {
    expect(hasSessionCookie([])).toBe(false);
  });

  it("ignore les cookies non pertinents", () => {
    expect(hasSessionCookie(["theme", "csrf-token"])).toBe(false);
  });

  it("détecte le cookie de session parmi d'autres", () => {
    expect(hasSessionCookie(["theme", "authjs.session-token"])).toBe(true);
  });
});
