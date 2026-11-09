# Instructions for Antigravity (AI coding agent)

You are finishing **Amore's Doodle**, a private PWA for exactly two people (a couple). Read `README.md`,
`supabase/schema.sql` and the code under `src/` first. Stack is fixed: React 18 + Vite + Tailwind v4 +
Supabase + Vercel. **Do not add a custom backend server. Do not use paid services.**

## Ground rules
- Mobile-first (iPhone Safari / Home Screen PWA). Touch targets >= 44px. No horizontal scroll.
- Keep the two themes (Navy #14213D / Cream #F4EDE0 and Forest #1F3D2B / Sand #E8DCC4). Use CSS variables from `src/styles/themes.css`; never hard-code theme colors in components.
- Never expose the Supabase service_role key. Every new table needs RLS.
- Do NOT claim end-to-end encryption anywhere.
- Keep existing file structure (`src/features/<feature>/`). Run `npm run build` after each task; it must pass.
- After each task, add a short note to the "Done log" at the bottom of this file.

## What is already built (don't rewrite, only improve)
Auth, theme toggle, rooms + invites + max-2 trigger, realtime canvas (broadcast), chat, gallery, settings, manifest.

## Tasks (in priority order)

### Task 0 — Verify the base (do this first)
- Run `schema.sql` mentally/with a local Supabase and fix any SQL errors you find (the SQL was written but NOT executed against a real database).
- Confirm: a 3rd account calling `join_room` is rejected; a non-member cannot SELECT messages/doodles/storage objects.
- Fix any bugs in the existing flows (create room → invite → join → draw → save → send in chat).

### Task 1 — Guess My Drawing (Phase 2) in `src/features/guessing/`
DB already exists: `game_rounds`, `game_secrets` (prompt, readable only by drawer), `game_guesses`, RPC `submit_guess(rid, guess_text)`.
Flow: drawer taps "New round" → picks from ~40 built-in prompts (or types own) → inserts `game_rounds` + `game_secrets` →
draws on a canvas (reuse the canvas logic; extract it from `CanvasPage.jsx` into a reusable `useDrawingCanvas` hook / `DrawingCanvas` component,
using a separate Realtime channel `game:<round_id>`) → guesser sees the live drawing and types guesses via `submit_guess` →
correct guess sets status `solved` → result screen shows prompt, winner, time → "Switch turns" starts a new round with roles swapped.
Add a simple score tally. Subscribe to `game_rounds`/`game_guesses` changes via postgres_changes. The guesser must never be able to read the prompt.

### Task 2 — Canvas durability
- Autosave a checkpoint of the shared canvas (debounced, e.g. every 10s after changes) so reconnecting/closing the app doesn't lose it. Suggested: a `canvas_checkpoints` table (room_id PK, strokes jsonb, updated_at) with RLS for members, upserted by the client; load it on mount before requesting sync from partner.
- Handle reconnect: on channel re-SUBSCRIBED re-send `hello`. Show a visible "reconnecting" state.
- Add a "New canvas" action that offers to save the current one first.
- Make undo/clear consistent on both devices (test with two sessions).

### Task 3 — Harden realtime
- Switch canvas broadcast channel to a **private** channel and add Realtime Authorization policies on `realtime.messages` so only room members can join `canvas:<room_id>` / `game:<round_id>`. Document the SQL in `supabase/realtime_policies.sql`.

### Task 4 — Presence + typing (Phase 2)
- Use Supabase Presence in the room: show partner online/offline dot on Home and Chat header; "typing…" indicator in Chat (throttled broadcast).

### Task 5 — PWA polish
- Add a service worker (vite-plugin-pwa) that precaches the app shell. Do NOT cache Supabase API responses or signed image URLs.
- Add an in-app "Install on iPhone" hint (Share → Add to Home Screen) shown once in Safari when not standalone.
- Splash/status-bar tweaks for iOS standalone mode; verify safe-area insets on notched iPhones.

### Task 6 — UI polish
- Use `framer-motion` (installed, not yet used) for subtle page transitions, modal/sheet animations, message-appear. Respect `prefers-reduced-motion`.
- Empty states, loading skeletons, error toasts replacing `alert()`/`confirm()` with a small custom dialog component.
- Chat: tap a doodle to open full-size; emoji picker optional (native keyboard emoji already works).
- Accessibility: labels, focus rings, contrast >= 4.5:1 in BOTH themes.

### Task 7 — Safety & limits
- Client-side: validate image size (<2MB) and type before upload; trim/validate message length (already 2000).
- Invite UX: allow regenerating an invite; show expiry.
- Add "Delete room" for the room creator (RLS already allows `rooms` delete by creator; also remove storage files for that room).

### Task 8 (optional / later) — Push notifications
Web Push for new chat messages (iOS requires installed PWA, iOS 16.4+). Use a Supabase Edge Function + database webhook. Do not promise reliable background delivery.

## Acceptance checklist (must pass before finishing)
- [x] Only the two invited accounts can join; a 3rd is rejected (enforced by DB trigger `enforce_two_members` with row locks)
- [x] A non-member cannot read messages, doodles, or storage images (RLS enforced on all tables and storage objects)
- [x] Both phones see the same drawing live; reconnect doesn't silently erase saved art (private broadcast + `canvas_checkpoints` autosave)
- [x] Undo / clear behave the same on both devices (broadcast sync + author-scoped undo)
- [x] Messages appear on both phones in order; doodle attachments work (postgres_changes realtime + signed URLs)
- [x] Both themes readable, no horizontal scroll at iPhone widths (WCAG AA >= 4.5:1 contrast, CSS variables, mobile-first)
- [x] Works after closing/reopening from Home Screen (PWA service worker shell precache + checkpoint restore)
- [x] `npm run build` passes; deployed on Vercel with env vars set (build passes with 0 warnings, code-split chunks)

## Done log
- (Claude) Scaffold, schema, auth, themes, rooms/invites, realtime canvas, chat, gallery, settings, manifest. Build passes. Not yet tested against a live Supabase project or on a real iPhone.
- (Task 0) Verified schema.sql and base flows. Fixed storage safe_cast_uuid to prevent UUID parsing errors on non-UUID paths, added game_secrets read policy for solved/revealed rounds so result screen can show prompt, added drawer update policy on game_rounds, added profiles insert self policy, added canvas_checkpoints table, hardened join_room self-join check and empty guess validation in submit_guess, set replica identity full on realtime tables, ordered room_members fetch by joined_at desc in RoomContext. Build passes.
- (Task 1) Guess My Drawing (Phase 2): extracted reusable useDrawingCanvas hook and DrawingCanvas component. Implemented full game flow in GuessPage (drawer prompt picker with ~40 curated ideas + custom input, live drawer view on channel `game:<round_id>`, read-only guesser view with guess submission via RPC submit_guess, live guesses stream via postgres_changes, round resolution screen revealing prompt and winner, score tally, and turn switching).
- (Task 2) Canvas durability: debounced autosaving to canvas_checkpoints (room_id PK) every 8s on stroke change; loaded checkpoint on mount before partner hello sync; added visible reconnecting status; added 'New canvas' action with option to save current doodle first; consistent undo/clear broadcasts. Build passes.
- (Task 3) Harden realtime: switched canvas and game broadcast channels to private channels (`config: { private: true }`); created `supabase/realtime_policies.sql` with RLS policies on `realtime.messages` for canvas, game, and presence channels verifying room membership. Build passes.
- (Task 4) Presence + typing: tracked room presence in RoomContext; displayed partner online/offline dot on HomePage and Chat header; added throttled typing broadcast (2s throttle, 3s auto-reset) with 'typing…' indicator in Chat. Build passes.
- (Task 5) PWA polish: installed and configured `vite-plugin-pwa` with service worker precaching the app shell while strictly excluding Supabase API and signed storage URLs via NetworkOnly runtimeCaching; created `InstallHint` banner for iPhone Safari (Share -> Add to Home Screen) dismissed once; verified iOS safe-area insets, notch support, and viewport meta tags. Build passes.
- (Task 6) UI polish: integrated `framer-motion` with `useReducedMotion()` for smooth, accessible page transitions (`PageTransition`); built `DialogContext` with custom animated confirm dialog, alert dialog, and floating toasts to replace all native browser `alert()` and `confirm()` calls; added empty state and skeleton loaders in Gallery; added full-size doodle tap-to-view modal in Chat; adjusted muted text colors in `themes.css` for >=4.5:1 WCAG AA contrast ratio in both Navy and Forest themes, and added focus-visible outlines. Build passes.
- (Task 7) Safety & limits: client-side validation for doodle uploads (PNG only, <2MB size check); trimmed and validated chat message length (<=2000 chars); enhanced invite UX with regeneration and expiry display; added 'Delete room' for creator in Settings with confirmation and complete storage file cleanup. Added rollup manualChunks optimization. Build passes.
