// src/app/page.tsx
import { auth } from "@/lib/auth/config";

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">42Bet</h1>
      <p className="text-zinc-500">
        Pronostics Coupe du Monde — École 42 Lausanne
      </p>
      {session?.user ? (
        <p>
          Connecté en tant que <strong>{session.user.login}</strong>.
        </p>
      ) : (
        <p>Connecte-toi avec ton compte 42 pour parier.</p>
      )}
    </main>
  );
}
