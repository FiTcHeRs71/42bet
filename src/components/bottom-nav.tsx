"use client";
// Bottom tab bar mobile (< md). Client uniquement pour usePathname.
// Le login + la server action signIn sont fournis par le layout (server).
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

const TABS: Tab[] = [
  { href: "/matches", label: "Matchs", icon: "⚽" },
  { href: "/leaderboard", label: "Classement", icon: "🏆" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({
  login,
  signInAction,
}: {
  login: string | null;
  signInAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const cls = (active: boolean) =>
    `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
      active ? "text-foreground" : "text-zinc-400"
    }`;

  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-40 flex md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={cls(isActive(pathname, t.href))}>
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </Link>
      ))}
      {login ? (
        <Link
          href={`/profile/${login}`}
          className={cls(isActive(pathname, `/profile/${login}`))}
        >
          <span className="text-lg">👤</span>
          Profil
        </Link>
      ) : (
        <form action={signInAction} className="flex flex-1">
          <button type="submit" className={cls(false) + " w-full"}>
            <span className="text-lg">👤</span>
            Profil
          </button>
        </form>
      )}
    </nav>
  );
}
