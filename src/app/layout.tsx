import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AppBackground } from "@/components/app-background";
import { BottomNav } from "@/components/bottom-nav";
import { auth, signIn } from "@/lib/auth/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "42Bet — Pronostics Coupe du Monde",
  description: "Pronostics foot sans argent réel pour l'École 42 Lausanne.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const login = session?.user?.login ?? null;

  return (
    <html
      lang="fr"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-20 md:pb-0">
        <AppBackground />
        <SiteHeader />
        {children}
        <SiteFooter />
        <BottomNav
          login={login}
          signInAction={async () => {
            "use server";
            await signIn("42");
          }}
        />
      </body>
    </html>
  );
}
