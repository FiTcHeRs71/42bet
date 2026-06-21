// src/components/site-header.tsx
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";
import { NavLink } from "@/components/nav-link";

export function SiteHeader() {
  return (
    <header className="glass-strong sticky top-0 z-40 flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          42<span className="text-cyan">Bet</span>
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          <NavLink href="/matches">Matchs</NavLink>
          <NavLink href="/leaderboard">Classement</NavLink>
        </nav>
      </div>
      <AuthButton />
    </header>
  );
}
