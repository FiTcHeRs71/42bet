import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth/config";

// Page publique : seul écran visible hors authentification.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.ftId) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center p-6">
      <section className="glass rise w-full p-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          42<span className="text-cyan">Bet</span>
        </h1>
        <p className="mt-2 text-zinc-400">
          Pronostics Coupe du Monde — École 42 Lausanne
        </p>
        <p className="mt-6 text-sm text-zinc-300">
          Connecte-toi avec ton compte 42 pour accéder aux pronostics et au
          classement. Aucune donnée n&apos;est visible sans connexion.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("42");
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 font-semibold text-white transition hover:bg-accent-2"
          >
            Se connecter avec 42
          </button>
        </form>
      </section>
    </main>
  );
}
