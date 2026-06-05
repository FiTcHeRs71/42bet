// src/components/auth-button.tsx
// Server component : lit la session et rend soit le bouton de connexion 42,
// soit l'avatar + login + déconnexion. signIn/signOut via server actions.
// <img> brut volontaire : l'hôte de l'avatar 42 varie, on évite de coupler
// next/image à un remotePatterns figé pour cette brique.
import { auth, signIn, signOut } from "@/lib/auth/config";

export async function AuthButton() {
  const session = await auth();

  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("42");
        }}
      >
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-transform active:scale-[0.98]"
        >
          Se connecter avec 42
        </button>
      </form>
    );
  }

  const { login, avatarUrl } = session.user;
  return (
    <div className="flex items-center gap-3">
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={login}
          width={32}
          height={32}
          className="rounded-full ring-1 ring-white/15"
        />
      )}
      <span className="hidden text-sm font-medium sm:inline">{login}</span>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button
          type="submit"
          className="text-sm text-zinc-400 transition-colors hover:text-foreground"
        >
          Déconnexion
        </button>
      </form>
    </div>
  );
}
