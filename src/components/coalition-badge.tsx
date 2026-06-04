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

export function CoalitionBadge({
  coalition,
  size = "md",
}: {
  coalition: Coalition | null;
  size?: keyof typeof SIZE;
}) {
  if (!coalition) {
    return (
      <span
        aria-label="Sans coalition"
        className={`inline-flex items-center rounded-full bg-zinc-200 font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300 ${SIZE[size]}`}
      >
        —
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
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${SIZE[size]}`}
    >
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
