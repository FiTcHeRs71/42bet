"use client";
// Au chargement de la page Matchs, amène automatiquement le premier match non
// encore joué (à venir / en cours) dans la vue, pour éviter de scroller toute la
// liste des matchs terminés à chaque visite. Aucune donnée Supabase/API ici.
import { useEffect } from "react";

export function ScrollToNextMatch({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [targetId]);

  return null;
}
