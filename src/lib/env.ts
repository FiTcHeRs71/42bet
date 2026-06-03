// src/lib/env.ts
// Tiny fail-fast helper for required environment variables. Throws a clear
// error (naming the variable) rather than letting `undefined` leak downstream.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
