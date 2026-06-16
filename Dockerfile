# syntax=docker/dockerfile:1

# ---- Stage 1: deps ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: builder ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Les variables NEXT_PUBLIC_* sont inlinées dans le bundle AU BUILD.
# Elles doivent donc être fournies ici en build-args, pas au runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` charge les modules serveur (clients Supabase, config NextAuth) qui
# valident la présence de ces secrets au niveau module. Vercel a ces variables
# dans l'env de build ; ici on fournit des PLACEHOLDERS pour passer le build.
# Ils ne sont PAS inlinés (préfixe non NEXT_PUBLIC_) et ce stage `builder` est
# jeté en multi-stage : aucune de ces valeurs n'atteint l'image finale. Les
# vraies valeurs sont injectées au RUNTIME via .env.docker.
ENV SUPABASE_SERVICE_ROLE_KEY=build-placeholder
ENV AUTH_SECRET=build-placeholder
ENV FT_API_UID=build-placeholder
ENV FT_API_SECRET=build-placeholder
ENV FT_API_CAMPUS_ID=47
ENV FOOTBALL_DATA_API_KEY=build-placeholder

RUN npm run build

# ---- Stage 3: runner ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# User non-root
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Sortie standalone : serveur minimal + assets statiques + public
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
