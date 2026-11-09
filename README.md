# Amore's Doodle 💌🎨
A private, mobile-first PWA for two people: live shared canvas, private chat, doodle gallery, (soon) guessing game.
Stack: React + Vite + Tailwind v4 + Supabase (auth, Postgres, Realtime, Storage) + Vercel.

## Quick start
1. `npm install`
2. Create a free project at https://supabase.com
3. Supabase → SQL Editor → paste and run **`supabase/schema.sql`** (whole file, once).
4. Supabase → Authentication → Providers → Email. For easy 2-person testing, turn OFF "Confirm email" (turn it back on later if you wish).
5. `cp .env.example .env.local` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API). Never use the service_role key here.
6. `npm run dev` → open the URL. Create account #1, create a room, generate an invite code.
7. Open a second browser/private window, create account #2, paste the code to join.
8. Deploy: push to GitHub → import in Vercel → add the same two env vars → Deploy.
9. iPhone: open the Vercel URL in Safari → Share → Add to Home Screen.

## What works now
- Email auth, profiles, two themes (Navy & Cream / Forest & Sand) via CSS variables, saved to profile
- Create private room, single-use 48h invite codes, DB-enforced max 2 members, leave room
- Live shared canvas (pointer events, batched broadcast, late-joiner sync, undo own stroke, clear, eraser, save PNG)
- Chat with realtime, pagination, doodle attachments
- Gallery with signed URLs, send-to-chat, delete own
- RLS on every table + private storage bucket policies
- PWA manifest + icons

## What's left
See **ANTIGRAVITY_TASKS.md**.
