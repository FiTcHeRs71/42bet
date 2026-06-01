# Brainstorming — Projet Pronostics Coupe du Monde 42

## Nom du projet
Trois noms en shortlist, à trancher à deux :
- **42Bet** — direct, lisible, sans fioriture
- **Segfault United** — humour dev, mémorable
- **42Goals** — double sens (buts / objectifs), universel

---

## Concept
Web app de pronostics foot ouverte aux étudiants et piscineux de l'École 42 Lausanne, sans argent réel, juste pour le fun et la compétition communautaire. Lancée à l'occasion de la Coupe du monde qui coïncide avec la nouvelle Piscine 42.

Auth via l'API 42 pour que tout le monde joue avec son vrai identité intra.

---

## Stack technique
| Couche | Techno |
|---|---|
| Frontend + API routes | Next.js (React) |
| Base de données + Auth | Supabase (PostgreSQL + OAuth) |
| Déploiement | Vercel |
| Auth 42 | OAuth2 via NextAuth.js (provider custom) |
| API matchs/résultats | football-data.org (gratuit, 10 req/min) |
| Cron job résultats | Vercel Cron Jobs ou cron-job.org |

---

## API 42 — Endpoints utilisés
- `GET /v2/me` — profil de l'user connecté (login, photo, niveau)
- `GET /v2/users/:user_id/coalitions` — coalition (nom, couleur, image)
- `GET /v2/campus/:campus_id/users` — lister les users du campus Lausanne
- `GET /v2/coalitions` — toutes les coalitions du campus

**Limites :** 2 req/sec, 1200 req/heure — largement suffisant.

**Données affichées grâce à l'API 42 :**
- Login + photo de profil
- Badge coalition dans le classement
- Distinction piscineux / cursus (optionnel)

---

## API Foot — football-data.org
- Inscription gratuite → clé API
- Couvre la Coupe du monde
- Données : matchs, scores, statuts en temps réel

**Flow résultats :**
1. Cron job toutes les X minutes
2. Fetch les matchs terminés
3. Compare avec la DB
4. Si score mis à jour → calcul automatique des points pour tous les paris concernés

---

## Système de points
| Prédiction | Points |
|---|---|
| Bon vainqueur (ou nul) | +1 pt |
| Score exact | +3 pts |

---

## Features MVP
Les features qui doivent tourner avant le premier match :

1. **Auth 42** — Login OAuth2, récupération login/photo/coalition, session persistante
2. **Liste des matchs** — tous les matchs affichés, statut (à venir / en cours / terminé), score final
3. **Système de paris** — choix du vainqueur + score avant coup d'envoi, verrou automatique au coup d'envoi, un pari par match par user
4. **Calcul des points** — automatique à la mise à jour du résultat
5. **Classement général** — trié par points, login + photo + coalition visible, mis à jour après chaque match

---

## Features Bonus (si temps)
- Paris sur le score exact séparé du vainqueur
- Classement par coalition
- Notifications / feed d'activité
- Stats perso (taux de réussite, meilleure journée)
- Vue par journée de matchs

---

## Récompenses
- 🏆 **Titre intra 42** pour le meilleur pronostiqueur (1er du classement)
- ⚡ **Points de coalition** pour tous les vainqueurs du classement

> À confirmer avec le staff 42 Lausanne — nécessite probablement une validation d'un bocal ou admin.

---

## Pages de l'app
| Route | Contenu |
|---|---|
| `/` | Home — matchs du jour + état des paris |
| `/matches` | Tous les matchs + interface de pari |
| `/leaderboard` | Classement général |
| `/profile/:login` | Profil user — stats, paris, coalition |

---

## Design / Ambiance
À décider à deux. Deux pistes envisagées :

- **Option A (Dark & Tech)** — fond sombre, accents néon, police monospace, vibe terminal 42
- **Option B (Énergie foot)** — fond vert pelouse, couleurs vives, plus accessible pour les piscineux

Couleurs des coalitions 42 à faire ressortir dans le classement dans les deux cas.

---

## Répartition du travail

### Personne A — Back / Data
- Setup Next.js + Supabase
- Auth OAuth2 API 42
- Schéma base de données
- Intégration football-data.org
- Cron job résultats + calcul des points
- Endpoints API internes (paris, classement)

### Personne B — Front / UI
- Design général + charte graphique
- Page liste des matchs
- Interface de paris (boutons, verrou)
- Page classement
- Profil user (photo, coalition, stats)

### Les deux ensemble
- Choix du nom final
- Enregistrement app OAuth sur l'intra 42
- Déploiement Vercel

---

## Prochaines étapes immédiates
1. Trancher le nom du projet
2. Créer l'app OAuth sur l'intra 42 : **Profile → Settings → API**
3. S'inscrire sur football-data.org pour la clé API
4. Initialiser le repo GitHub
5. Setup Next.js + Supabase
