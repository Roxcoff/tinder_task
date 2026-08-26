# Le tri des tâches

PWA de pilotage collaboratif — Succession MKD · Serenity SA · MIZZY & Co.
Next.js (App Router) + Prisma + Postgres + notifications push (Web Push / VAPID).

## 1. Développement local

```bash
npm install
cp .env.example .env
```

Pour développer en local, le plus simple est d'utiliser **directement la base Vercel** (voir étape 3
ci-dessous) : une fois le projet lié avec `vercel link`, faites `vercel env pull .env.local` pour récupérer
automatiquement `POSTGRES_URL`. Sinon, mettez l'URL d'une base Postgres gratuite (Neon, Supabase...) dans
cette variable de `.env`.

```bash
npx prisma migrate dev --name init   # crée les tables, à faire une seule fois — lance aussi le seed automatiquement
npx web-push generate-vapid-keys     # copiez les 2 clés dans .env
npm run dev
```

`prisma migrate dev` exécute `prisma/seed.js`, qui recharge les 27 tâches de la roadmap "45 jours" (une seule
fois — il ne fait rien si la base contient déjà des tâches). Pour le relancer manuellement : `npx prisma db seed`.

Ouvrez http://localhost:3000. Les notifications **push** ne fonctionnent qu'en HTTPS ou sur `localhost`
(Chrome/Firefox les autorisent en local), donc le développement en local suffit pour les tester avant
déploiement.

## 2. Pousser le code sur GitHub

```bash
git init
git add .
git commit -m "Le tri des tâches — v1"
gh repo create le-tri-des-taches --private --source=. --remote=origin --push
```
(ou créez le repo à la main sur github.com puis `git remote add origin <url>` + `git push -u origin main`)

## 3. Déployer sur Vercel avec une base Postgres gratuite

1. Allez sur **vercel.com** → *Add New… → Project* → importez le repo GitHub que vous venez de créer.
   Vérifiez que **Framework Preset** est bien détecté sur **Next.js** (pas "Other") — sinon les routes
   API ne fonctionneront pas.
2. Ne déployez pas encore, ou laissez le premier déploiement échouer (normal, la base n'existe pas encore) —
   allez dans l'onglet **Storage** du projet Vercel → *Create Database* → choisissez une offre **Postgres**
   (ex. **Prisma Postgres**, gratuite). Connectez-la au projet.
3. Vercel ajoute automatiquement une variable `POSTGRES_URL` — c'est exactement ce que `prisma/schema.prisma`
   attend, rien à faire de plus ici. (Si votre fournisseur injecte d'autres noms de variables, adaptez
   `env(...)` dans `prisma/schema.prisma` en conséquence.)
4. Toujours dans **Settings → Environment Variables**, ajoutez :
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (générées avec `npx web-push generate-vapid-keys`)
   - `VAPID_SUBJECT` (ex. `mailto:vous@exemple.com`)
   - `SESSION_SECRET` (chaîne aléatoire longue, ex. `openssl rand -hex 32`)
   - `ACCESS_CODE` (optionnel — laissez vide si vous ne voulez pas de code d'équipe)
5. Dans **Settings → General → Build & Development Settings**, changez la commande de build pour :
   ```
   prisma generate && prisma migrate deploy && next build
   ```
   (ça applique les migrations sur la base de prod à chaque déploiement — pratique pour une petite équipe).
6. Relancez un déploiement (*Deployments → Redeploy*). L'app est en ligne sur `https://<projet>.vercel.app`.
7. Pour précharger les 27 tâches de la roadmap sur la base de prod : en local, `vercel env pull .env.local`
   puis `npx prisma db seed` (une seule fois — il ne fait rien si des tâches existent déjà).

## 4. Installer la PWA

- **Android/Desktop (Chrome/Edge)** : une icône d'installation apparaît dans la barre d'adresse, ou menu →
  *Installer l'application*. Les notifications push fonctionnent alors même app fermée.
- **iPhone (Safari)** : Partager → *Sur l'écran d'accueil*. C'est **obligatoire** pour que les notifications
  push fonctionnent sur iOS — sans cet ajout, Apple les bloque complètement (limitation système, pas un bug).

## 5. Icônes

Des icônes provisoires (`public/icons/icon-192.png`, `icon-512.png`, `icon.svg`) sont déjà générées et
prêtes à l'emploi, dans la palette de l'app. Remplacez-les par votre propre visuel plus tard si besoin —
même dimensions et mêmes noms de fichiers.

## Structure du projet

```
src/app/            routes Next.js (pages + API)
src/app/api/         toutes les routes API (tasks, notifications, push, auth)
src/components/App.jsx   toute l'interface (trier / tableau / alertes)
src/lib/              prisma, session (cookie signé), push (web-push)
prisma/schema.prisma   modèle de données
public/sw.js           service worker (réception des push)
public/manifest.json   manifeste PWA (installabilité)
```
