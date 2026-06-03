// src/components/site-header.tsx
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
      <Link href="/" className="text-lg font-bold tracking-tight">
        42Bet
      </Link>
      <AuthButton />
    </header>
  );
}
