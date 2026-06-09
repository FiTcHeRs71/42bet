---
name: coalition-badge
description: Composant React unique pour afficher un badge coalition 42 (couleur officielle + image) — cohérent partout dans l'app (classement, profil, etc.)
---

# Skill : badge coalition

## Quand utiliser

Dès qu'on affiche une appartenance coalition d'un user (classement, profil, carte de pari, header). **Toujours via ce composant**, jamais en inline.

## Règles non-négociables

1. **Source de couleur unique** : la couleur vient de `coalitions.color` en DB (synchro API 42), pas hardcodée.
2. **Fallback** : si user sans coalition (rare mais possible), badge gris neutre avec "—".
3. **Accessibilité** : `aria-label` avec le nom de la coalition. Contraste texte/fond ≥ 4.5:1 (vérifier les couleurs sombres avec texte blanc, claires avec texte noir).
4. **Pas de lien** : le badge est purement informatif, pas cliquable (un futur composant `CoalitionLink` pourra le wrapper si besoin).

## API du composant

```tsx
// src/components/CoalitionBadge.tsx

type Coalition = {
  name: string;
  color: string;        // hex "#RRGGBB" depuis API 42
  imageUrl?: string;
};

type Props = {
  coalition: Coalition | null;
  size?: "sm" | "md" | "lg";  // défaut "md"
  showLabel?: boolean;        // défaut true ; false = pastille logo-seul
};

export function CoalitionBadge({ coalition, size = "md", showLabel = true }: Props) {
  if (!coalition) return <NeutralBadge size={size} showLabel={showLabel} />;
  // ...
}
```

### Mode logo-seul (`showLabel={false}`)

Pour les **lignes de classement denses** (notamment mobile), passer
`showLabel={false}` : le badge devient une **pastille circulaire à largeur fixe**
(couleur coalition + logo, **sans le nom**). Ça évite le débordement horizontal
d'un nom long (« House of Processes ») sur écran étroit. Le nom reste accessible
via `aria-label` **et** `title` (tooltip au survol). À réserver aux listes : dans
l'onglet « Coalitions » et le header de profil, on garde le nom (`showLabel`
implicite à `true`).

## Tailles

| Size | Hauteur | Usage |
|---|---|---|
| `sm` | 20px | Inline dans une ligne de classement |
| `md` | 28px | Profil, carte user |
| `lg` | 40px | Header de profil |

## Choix du texte (noir/blanc selon contraste)

```ts
function pickTextColor(hex: string): "#000" | "#fff" {
  const [r, g, b] = [hex.slice(1,3), hex.slice(3,5), hex.slice(5,7)]
    .map(h => parseInt(h, 16));
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.5 ? "#000" : "#fff";
}
```

## Anti-patterns à refuser

- ❌ `<span style={{ background: "#ff0000" }}>` inline pour une coalition
- ❌ Couleur de coalition hardcodée par nom (`if name === "The Federation" then red`)
- ❌ Badge sans `aria-label`
- ❌ Wrapper en `<button>` ou `<a>` (le badge est passif)
- ❌ Lazy load de l'image (les images coalition sont petites, ~5KB, et toujours visibles)

## Liens

- [[42api-fetch]] — d'où viennent les données coalition (`GET /v2/coalitions`)
