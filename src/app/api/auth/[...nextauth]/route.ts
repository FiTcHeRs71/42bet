// src/app/api/auth/[...nextauth]/route.ts
// Runtime Node (pas edge) : supabaseAdmin + service_role.
import { handlers } from "@/lib/auth/config";

export const { GET, POST } = handlers;
