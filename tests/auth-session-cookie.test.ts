import { describe, it, expect } from "vitest";

import { hasSessionCookie } from "@/lib/auth/session-cookie";

/** Construit un faux porteur de cookies à partir d'une liste de noms présents. */
function cookies(...present: string[]) {
  return { has: (name: string) => present.includes(name) };
}

describe("hasSessionCookie", () => {
  it("détecte le cookie de prod (__Secure-authjs.session-token)", () => {
    expect(hasSessionCookie(cookies("__Secure-authjs.session-token"))).toBe(true);
  });

  it("détecte le cookie de dev (authjs.session-token)", () => {
    expect(hasSessionCookie(cookies("authjs.session-token"))).toBe(true);
  });

  it("retourne false sans aucun cookie", () => {
    expect(hasSessionCookie(cookies())).toBe(false);
  });

  it("ignore les cookies non pertinents", () => {
    expect(hasSessionCookie(cookies("theme", "csrf-token"))).toBe(false);
  });

  it("détecte le cookie de session parmi d'autres", () => {
    expect(hasSessionCookie(cookies("theme", "authjs.session-token"))).toBe(true);
  });
});
