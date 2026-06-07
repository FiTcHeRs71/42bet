# Spec — Logo de coalition dans le `CoalitionBadge`

> Statut : validé en brainstorming le 2026-06-07. Cible : branche `feat/coalitions-pipeline` (travail UI empilé pour une PR groupée).

## 1. Objectif

Afficher le **logo de la coalition** (`image_url`) à gauche du nom dans le
`CoalitionBadge`, sans changer le reste de son comportement. Le composant est unique
(skill `coalition-badge`) : la modification se propage automatiquement aux 4
emplacements UI (leaderboard md + sm, accueil sm, profil md).

La donnée `image_url` est **déjà disponible** de bout en bout (API 42 →
`pickUserCoalition` → colonne `coalitions.image_url` → upsert dans `auth/config.ts` →
requête `listPlayers` → type du badge). Aucun changement de données, de requête ou de
schéma.

## 2. Périmètre

**Dans le périmètre :**
- `src/components/coalition-badge.tsx` — rendu conditionnel du logo.

**Hors périmètre :**
- Aucune modification de `src/lib/*`, des requêtes Supabase, des types DB, ni de la
  pipeline coalitions.
- Pas de nouveau test unitaire (composant purement présentatif — voir §6).
- Pas de changement des autres emplacements appelants (ils consomment le composant tel
  quel).

## 3. Comportement (3 cas)

1. **Coalition avec `image_url` non nul** : pastille colorée actuelle (couleur de fond +
   texte contrasté via `readableTextColor`), avec le **logo à gauche du nom**, posé sur
   un **disque blanc plein** (`bg-white`, arrondi) qui garantit le contraste quel que
   soit l'emblème (souvent blanc/monochrome sur fond transparent). Le nom reste affiché
   à droite, inchangé.
2. **Coalition avec `image_url` nul** : **pas de disque ni de logo** — rendu identique à
   l'actuel (pastille colorée + nom seul). Aucun trou visuel.
3. **`coalition === null`** : fallback inchangé (pastille grise avec `—`,
   `aria-label="Sans coalition"`).

## 4. Implémentation — `src/components/coalition-badge.tsx`

### 4.1 Tailles du logo

Ajouter une map parallèle à `SIZE`, indexée par les mêmes clés (`sm | md | lg`), pour la
taille de l'emblème (disque + image) :

```ts
const LOGO_SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;
```

> On garde `SIZE` (height/padding/text de la pastille) inchangée et on ajoute `LOGO_SIZE`
> à côté, plutôt que de mélanger des classes de natures différentes dans une seule string.

### 4.2 Conteneur

Le `<span>` de la pastille colorée (cas coalition non nulle) reçoit `gap-1.5` pour
espacer logo et nom :

```tsx
className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${SIZE[size]}`}
```

### 4.3 Rendu du logo

Dans le `return` du cas « coalition non nulle », **avant** `{coalition.name}`, insérer :

```tsx
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
```

- Le disque blanc est `bg-white` + `rounded-full`, dimension via `LOGO_SIZE[size]`.
- L'image remplit le disque (`h-full w-full`), `object-contain` pour ne pas déformer,
  léger `p-0.5` pour que l'emblème ne touche pas le bord.
- `alt=""` : décoratif — le nom textuel et l'`aria-label` du badge portent déjà
  l'information.
- Le commentaire `eslint-disable-next-line @next/next/no-img-element` est obligatoire
  (ESLint interdit `<img>` sinon — pattern déjà en place dans le projet).

## 5. Pièges connus

- **`<img>` Next.js** : ESLint `@next/next/no-img-element` → commentaire `disable`
  obligatoire.
- **`image_url` nul** : fréquent (toutes les coalitions n'ont pas de logo en base) →
  toujours conditionner l'affichage du disque sur `coalition.image_url`.
- **Contraste** : le disque blanc est justement là pour les emblèmes clairs ; ne pas le
  retirer.
- **Pastille grise (cas null)** : ne reçoit jamais de logo.

## 6. Tests

Le projet ne teste que la logique pure ; `CoalitionBadge` est purement présentatif et
`readableTextColor` reste inchangé. **Aucun nouveau test unitaire.** Vérification par :

1. `npm run typecheck` — sans erreur.
2. `npm run lint` — sans erreur (commentaire `no-img-element` présent).
3. `npm test` — pas de régression (108 verts).
4. `npm run build` — succès.
5. Vérification manuelle du rendu sur `/profile/[login]` (serveur dev) : logo sur disque
   blanc à gauche du nom, fallback nom-seul quand `image_url` est nul.

## 7. Critères d'acceptation

1. Le badge affiche le logo (sur disque blanc) à gauche du nom quand `image_url` existe.
2. Le badge reste identique à l'actuel quand `image_url` est nul ou coalition nulle.
3. Les 3 tailles (`sm`/`md`/`lg`) rendent un logo proportionné.
4. Toutes les gates vertes (typecheck, lint, test, build).
5. Aucune modification hors `src/components/coalition-badge.tsx`.
