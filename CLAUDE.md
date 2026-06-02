# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run serve          # Local dev server at http://localhost:8080
npm test               # Run Playwright E2E tests (headless)
npm run test:ui        # Interactive Playwright test runner
npx playwright test tests/modals.spec.js   # Run a single test file
npm run migrate:dates  # Run date normalization migration (use --dry-run first)
```

There is **no build step** — the app is pure HTML/CSS/JS served directly.

## Architecture

**The Table** is a vanilla JS PWA (no framework, no bundler) backed by Supabase (PostgreSQL + Auth). It runs entirely in the browser and deploys to GitHub Pages as static files.

### File responsibilities

| File | Role |
|------|------|
| `index.html` | Single HTML shell — two top-level screens: `#auth-screen` and `#app-screen` with 5 tab panels |
| `js/app.js` | All UI logic: tab switching, modal management, rendering, CRUD wiring (~1,260 lines) |
| `js/auth.js` | Supabase auth, session management, client-side rate limiting (5 attempts → 60s lockout) |
| `js/db.js` | All database operations; maps DB rows to app objects via `rowToRestaurant()` / `rowToDish()` |
| `js/map.js` | Leaflet map, geocoding via Photon API, GPS location, haversine distance |
| `css/style.css` | Editorial dark luxury aesthetic (~1,800 lines); mobile-first, no preprocessor |
| `sw.js` | Service Worker: network-first for app assets, cache-first for vendor libs; Supabase/API calls bypass cache |
| `supabase_schema.sql` | Full DB schema with RLS policies, constraints, and triggers |

### State & rendering

There is no state library. Module-level variables in `app.js` (`restaurants[]`, `dishes[]`, `activeTab`, `ratings{}`, etc.) are the source of truth on the client. UI updates are done by re-rendering DOM directly. `loadAll()` fetches from Supabase and triggers re-renders.

### Navigation

Tab-based, not URL-based. `switchTab(name)` shows/hides `.tab-panel` divs and sets `activeTab`. The Map and Community tabs are lazily initialized on first switch.

### Responsive layout

The app is mobile-first (390px base). At **≥768px** the layout switches via a single CSS `@media` block at the bottom of `style.css`:

- **Auth entrance** becomes a two-column grid: hero/animation left, CTA right.
- **App shell** (`#app-screen.active`) switches from `display: flex` (column) to `display: grid` with a 220px left sidebar. The `.bottom-nav` moves into the `sidebar` grid area and becomes a sticky vertical nav — `position: fixed` is overridden to `position: sticky`.
- **Tab content** is constrained to `max-width: 860px` and centred; the map tab is exempt (`max-width: none`).

The `.auth-hero-photo` div uses CSS `::before`/`::after` pseudo-elements for an animated candlelit bokeh effect. To replace it with a real video, drop `images/hero.mp4` and uncomment the `<video class="hero-video">` line in `index.html` — `.hero-video + .auth-hero-photo { display: none }` hides the CSS animation automatically.

### Database & security

- All tables have Row-Level Security (RLS) — users see only their own data plus rows where `is_public = true`.
- `updated_at` is set server-side by a trigger (never trust client-supplied timestamps).
- `overall_avg` on restaurants is a PostgreSQL generated column — do not write to it.
- Schema lives in `supabase_schema.sql`; one-off migrations are in `scripts/`.

### External dependencies (CDN, no npm install)

- **Supabase v2** — auth + DB client
- **Leaflet v1.9.4** — maps (CARTO Voyager tiles)
- **Photon/Komoot API** — geocoding and restaurant autocomplete search
- **DM Sans / Cormorant Garamond / JetBrains Mono** — Google Fonts

### Testing

Playwright E2E tests only (no unit tests). Tests run against a local server on port 8080 with an iPhone 14 Pro viewport (390×844px). Start `npm run serve` before running tests if the server isn't already up.

### Deployment

Push to `main` → GitHub Pages auto-deploys. The Supabase URL and anon key are hardcoded in `auth.js` (intentional for this static deployment model — no server-side secrets needed with RLS).
