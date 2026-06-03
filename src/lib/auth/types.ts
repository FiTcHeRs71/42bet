// src/lib/auth/types.ts
// Étend les types NextAuth pour exposer l'identité 42 sans casts `as`.
// JWT augmentation cible @auth/core/jwt (next-auth/jwt n'a pas de module propre
// en v5 beta — il re-exporte depuis @auth/core/jwt).
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      ftId: number;
      login: string;
      avatarUrl: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    ftId?: number;
    login?: string;
    avatarUrl?: string | null;
  }
}

export {};
