// src/lib/auth/config.ts
// Plomberie NextAuth v5. Server-only : importe supabaseAdmin (service_role).
// Le provider built-in 42-school a son id forcé à "42" pour matcher la redirect
// URI enregistrée (/api/auth/callback/42). Le profil /v2/me est récupéré par
// NextAuth avec le token UTILISATEUR (pas fetch42, qui utilise le token applicatif).
import "server-only";

import NextAuth from "next-auth";
import FortyTwo from "next-auth/providers/42-school";

import { fetch42 } from "@/lib/api-42";
import { mapFt42Profile, type Ft42Me } from "@/lib/auth/profile";
import { upsertPlayer, type UpsertDeps } from "@/lib/auth/upsert-player";
import type { Ft42Coalition } from "@/lib/coalitions";
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
  async fetchUserCoalitions(ftId) {
    return fetch42<Ft42Coalition[]>(`/v2/users/${ftId}/coalitions`);
  },
  async upsertCoalition(ref) {
    const { data, error } = await supabaseAdmin
      .from("coalitions")
      .upsert(
        {
          ft_id: ref.ftId,
          name: ref.name,
          color: ref.color,
          image_url: ref.imageUrl,
        },
        { onConflict: "ft_id" },
      )
      .select("id")
      .single();
    return { id: data?.id ?? null, error };
  },
  async setCoalition(ftId, coalitionId) {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ coalition_id: coalitionId })
      .eq("ft_id", ftId);
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
