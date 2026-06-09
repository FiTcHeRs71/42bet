// src/components/coalition-badge.tsx
// Badge coalition 42 — composant unique réutilisable (skill coalition-badge).
// Couleur officielle depuis la DB (jamais hardcodée), fallback gris si pas de
// coalition, aria-label = nom, texte noir/blanc choisi selon la luminance du fond
// (contraste). Purement informatif (pas de lien).

type Coalition = { name: string; color: string; image_url: string | null };

const SIZE = {
  sm: "h-5 px-2 text-[10px]",
  md: "h-6 px-2.5 text-xs",
  lg: "h-7 px-3 text-sm",
} as const;

const LOGO_SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

// Pastille circulaire (mode logo-seul) : largeur fixe, ne déborde jamais d'une
// ligne de classement étroite (mobile).
const DOT_SIZE = {
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-7 w-7",
} as const;

export function CoalitionBadge({
  coalition,
  size = "md",
  showLabel = true,
}: {
  coalition: Coalition | null;
  size?: keyof typeof SIZE;
  // false = pastille logo-seul (sans le nom), pour les lignes denses (mobile).
  // Le nom reste exposé via aria-label/title (accessibilité + survol).
  showLabel?: boolean;
}) {
  if (!coalition) {
    return (
      <span
        aria-label="Sans coalition"
        className={
          showLabel
            ? `inline-flex items-center rounded-full bg-zinc-200 font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300 ${SIZE[size]}`
            : `inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300 ${DOT_SIZE[size]}`
        }
      >
        —
      </span>
    );
  }

  if (!showLabel) {
    return (
      <span
        aria-label={coalition.name}
        title={coalition.name}
        style={{ backgroundColor: coalition.color }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full ${DOT_SIZE[size]}`}
      >
        {coalition.image_url ? (
          <span
            className={`inline-flex items-center justify-center rounded-full bg-white ${LOGO_SIZE[size]}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coalition.image_url}
              alt=""
              className="h-full w-full rounded-full object-contain p-0.5"
            />
          </span>
        ) : (
          <span
            style={{ color: readableTextColor(coalition.color) }}
            className="text-[10px] font-bold"
          >
            {coalition.name.slice(0, 1)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      aria-label={coalition.name}
      style={{
        backgroundColor: coalition.color,
        color: readableTextColor(coalition.color),
      }}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${SIZE[size]}`}
    >
      {coalition.image_url && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white ${LOGO_SIZE[size]}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coalition.image_url}
            alt=""
            className="h-full w-full rounded-full object-contain p-0.5"
          />
        </span>
      )}
      {coalition.name}
    </span>
  );
}

/** Noir ou blanc selon la luminance perçue du fond (contraste lisible). */
function readableTextColor(hex: string): "#000" | "#fff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000" : "#fff";
}
