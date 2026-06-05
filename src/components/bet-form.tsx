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
      className="h-11 shrink-0 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 text-sm font-semibold text-white shadow shadow-accent/30 transition-transform active:scale-[0.98] disabled:opacity-50 sm:h-7 sm:px-3 sm:text-xs"
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
    <form
      action={action}
      className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-1"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <div className="flex items-center gap-2 sm:gap-1">
        <input
          type="number"
          name="homeScore"
          min={0}
          max={99}
          required
          defaultValue={defaultHome}
          aria-label="Score domicile"
          className="h-11 w-12 rounded-lg border border-white/15 bg-white/5 text-center text-base tabular-nums outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 sm:h-7 sm:w-10 sm:text-sm"
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
          className="h-11 w-12 rounded-lg border border-white/15 bg-white/5 text-center text-base tabular-nums outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 sm:h-7 sm:w-10 sm:text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        {message && <span className="text-xs text-zinc-400">{message}</span>}
        <SubmitButton hasBet={hasBet} />
      </div>
    </form>
  );
}
