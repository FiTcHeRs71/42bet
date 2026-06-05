"use client";
// Lien de navigation avec état actif. Client uniquement pour usePathname —
// aucune donnée Supabase/API 42 ici.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`text-sm transition-colors ${
        active
          ? "font-semibold text-foreground"
          : "text-zinc-400 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
