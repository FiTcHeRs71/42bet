// src/lib/auth/config.ts
// Plomberie NextAuth v5. Server-only : importe supabaseAdmin (service_role).
// Le provider built-in 42-school a son id forcé à "42" pour matcher la redirect
// URI enregistrée (/api/auth/callback/42). Le profil /v2/me est récupéré par
// NextAuth avec le token UTILISATEUR (pas fetch42, qui utilise le token applicatif).
import "server-only";

import NextAuth from "next-auth";
import FortyTwo from "next-auth/providers/42-school";

import { mapFt42Profile, type Ft42Me } from "@/lib/auth/profile";
import { upsertPlayer, type UpsertDeps } from "@/lib/auth/upsert-player";
import { requireEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import "@/lib/auth/types";

const upsertDeps: UpsertDeps = {
  async upsertUser(row) {
    const { error } = await supabaseAdmin
      .from("users")
      .upsert(row, { onConflict: "ft_id" });
    return { error };
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      ...FortyTwo({
        clientId: requireEnv("FT_API_UID"),
        clientSecret: requireEnv("FT_API_SECRET"),
        profile: (raw: Ft42Me) => {
          const p = mapFt42Profile(raw);
          return { id: String(p.ftId), name: p.login, image: p.avatarUrl };
        },
      }),
      id: "42",
    },
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile) return false;
      await upsertPlayer(mapFt42Profile(profile as unknown as Ft42Me), upsertDeps);
      return true;
    },
    async jwt({ token, profile }) {
      if (profile) {
        const p = mapFt42Profile(profile as unknown as Ft42Me);
        token.ftId = p.ftId;
        token.login = p.login;
        token.avatarUrl = p.avatarUrl;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.ftId != null) {
        session.user.ftId = token.ftId;
        session.user.login = token.login ?? "";
        session.user.avatarUrl = token.avatarUrl ?? null;
      }
      return session;
    },
  },
});
