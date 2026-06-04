"use client";
// Formulaire inline de saisie d'un pari (2 scores). Appelle la server action
// placeBet et affiche un message inline selon le résultat. Pré-rempli si un pari
// existe déjà. Server-safe : n'importe que la server action, jamais supabaseAdmin.

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { placeBet, type PlaceBetError } from "@/app/matches/actions";

const ERROR_LABEL: Record<PlaceBetError, string> = {
  unauth: "Connecte-toi pour parier.",
  invalid: "Score invalide.",
  "no-user": "Profil introuvable.",
  "no-match": "Match introuvable.",
  locked: "Trop tard, le match a commencé.",
};

function SubmitButton({ hasBet }: { hasBet: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-zinc-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
    >
      {pending ? "…" : hasBet ? "Modifier" : "Parier"}
    </button>
  );
}

export function BetForm({
  matchId,
  defaultHome,
  defaultAway,
}: {
  matchId: string;
  defaultHome?: number;
  defaultAway?: number;
}) {
  const hasBet = defaultHome !== undefined && defaultAway !== undefined;
  const [message, setMessage] = useState<string | null>(null);

  async function action(formData: FormData) {
    const result = await placeBet(formData);
    setMessage(result.ok ? "Enregistré ✓" : ERROR_LABEL[result.reason]);
  }

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="matchId" value={matchId} />
      <input
        type="number"
        name="homeScore"
        min={0}
        max={99}
        required
        defaultValue={defaultHome}
        aria-label="Score domicile"
        className="w-10 rounded border border-black/15 bg-transparent px-1 py-0.5 text-center tabular-nums dark:border-white/15"
      />
      <span className="text-zinc-400">-</span>
      <input
        type="number"
        name="awayScore"
        min={0}
        max={99}
        required
        defaultValue={defaultAway}
        aria-label="Score extérieur"
        className="w-10 rounded border border-black/15 bg-transparent px-1 py-0.5 text-center tabular-nums dark:border-white/15"
      />
      <SubmitButton hasBet={hasBet} />
      {message && <span className="text-xs text-zinc-500">{message}</span>}
    </form>
  );
}
