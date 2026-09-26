# Royal Library — Production Launch Package

Digital Library Management and Personalized Book Recommendation System.

This package is prepared for:
- React + Vite frontend
- Supabase PostgreSQL + Authentication
- GitHub repository
- GitHub Pages deployment
- Responsive desktop/mobile interface

## 1. Supabase setup

Open your Supabase project and run:

`supabase/schema.sql`

The schema creates:
- profiles
- categories
- books
- borrowings
- favourites
- activities
- notifications
- authentication trigger
- borrowing/return RPCs
- hybrid recommendation RPC
- Row Level Security policies
- required Data API grants
- starter categories and books

After creating your first account, make that account an administrator from the Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL';
```

Do not put a service-role/secret key in this frontend.

## 2. Local configuration

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Then:

```bash
npm install
npm run dev
```

## 3. GitHub

Create/use the repository:

`Sparklingchick/royal-library`

Push this project to the `main` branch.

The Vite configuration already uses:

`/royal-library/`

If you use a different repository name, change `base` in `vite.config.js`.

## 4. GitHub Actions secrets

In GitHub:

Settings → Secrets and variables → Actions → New repository secret

Create:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use your Supabase Project URL and publishable key.

The workflow `.github/workflows/deploy.yml` builds the app with those values and publishes `dist/` to GitHub Pages.

## 5. GitHub Pages

In GitHub:

Settings → Pages → Build and deployment → Source → GitHub Actions

Then push to `main`.

The deployment workflow will run automatically.

Expected URL:

`https://sparklingchick.github.io/royal-library/`

## 6. Supabase Auth URL configuration

In Supabase:

Authentication → URL Configuration

Set the Site URL to:

`https://sparklingchick.github.io/royal-library/`

Add the same URL to the allowed redirect URLs.

For local testing you can also allow:

`http://localhost:5173/royal-library/`

## 7. Production security

The browser must use only the Supabase publishable key. Supabase Row Level Security is the protection boundary for database access.

Never commit:
- service-role keys
- secret keys
- database passwords
- `.env`

## 8. Launch checklist

- [ ] Run schema.sql
- [ ] Confirm tables exist
- [ ] Register an account
- [ ] Promote one account to admin
- [ ] Test sign in/sign out
- [ ] Test catalogue search
- [ ] Test borrowing
- [ ] Test returning
- [ ] Test favourites
- [ ] Test recommendations
- [ ] Add GitHub Actions secrets
- [ ] Enable GitHub Pages via Actions
- [ ] Configure Supabase Auth Site URL
- [ ] Push to main
- [ ] Open the live GitHub Pages URL
