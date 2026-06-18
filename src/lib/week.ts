// Fenêtre hebdomadaire "vendredi → vendredi" en Europe/Zurich (DST-correct).
// Pur : aucune I/O. La semaine court du dernier vendredi 00h00 (Zurich) au
// vendredi suivant 00h00. Sert au classement "meilleur de la semaine".

const TZ = "Europe/Zurich";
const FRIDAY = 5; // getUTCDay(): 0=dimanche .. 6=samedi

/** Décalage (ms) du fuseau Zurich à l'instant `date` (positif à l'est de UTC). */
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUtc - date.getTime();
}

/** Composantes calendaires (année/mois/jour) de `date` lues en Europe/Zurich. */
function zurichYMD(date: Date): { y: number; m: number; d: number } {
  const local = new Date(date.getTime() + tzOffsetMs(date));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
}

/** Instant UTC correspondant à 00h00 Zurich du jour calendaire y/m/d. */
function zurichMidnight(y: number, m: number, d: number): Date {
  // Décalage estimé à midi local ce jour-là : évite l'ambiguïté de la
  // transition DST qui survient la nuit, jamais à midi.
  const noonGuess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - tzOffsetMs(noonGuess));
}

/** Fenêtre [start, end) de la semaine courante : vendredi 00h00 → vendredi 00h00. */
export function currentWeekWindow(now: Date): { start: Date; end: Date } {
  const { y, m, d } = zurichYMD(now);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const daysSinceFriday = (weekday - FRIDAY + 7) % 7;

  const fri = new Date(Date.UTC(y, m - 1, d - daysSinceFriday));
  const start = zurichMidnight(
    fri.getUTCFullYear(),
    fri.getUTCMonth() + 1,
    fri.getUTCDate(),
  );

  const nextFri = new Date(
    Date.UTC(fri.getUTCFullYear(), fri.getUTCMonth(), fri.getUTCDate() + 7),
  );
  const end = zurichMidnight(
    nextFri.getUTCFullYear(),
    nextFri.getUTCMonth() + 1,
    nextFri.getUTCDate(),
  );

  return { start, end };
}
