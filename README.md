# 🍽 The Table — Setup Guide

A Progressive Web App (PWA) restaurant journal with user accounts, community sharing, and map integration.

---

## Step 1 — Create a Free Supabase Project

1. Go to **[supabase.com](https://supabase.com)** → Sign up / Log in
2. Click **New Project** → name it "the-table" → set a database password → Create
3. Wait ~1 minute for it to provision

---

## Step 2 — Run the Database Schema

1. In your Supabase dashboard → click **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open `supabase_schema.sql` from this folder
4. Paste the entire contents → click **Run**
5. You should see "Success. No rows returned"

---

## Step 3 — Get Your API Keys

1. In Supabase → **Project Settings** (gear icon) → **API**
2. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public** key (long JWT string)

---

## Step 4 — Add Your Keys to the App

Open **`js/auth.js`** and replace the placeholder values:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';   // ← paste here
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';                 // ← paste here
```

---

## Step 5 — Add App Icons

Create two PNG icons and place them in the `icons/` folder:
- `icons/icon-192.png` — 192×192px
- `icons/icon-512.png` — 512×512px

> **Tip:** Use [favicon.io](https://favicon.io) or [realfavicongenerator.net](https://realfavicongenerator.net) to generate icons quickly. Use a fork and knife emoji or a simple plate graphic.

---

## Step 6 — Deploy to GitHub Pages

### First time:
```bash
# 1. Create a new GitHub repo named "the-table" (or any name)
# 2. Push this folder:
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/the-table.git
git push -u origin main
```

### Enable GitHub Pages:
1. Go to your repo on GitHub → **Settings** → **Pages**
2. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`
3. Click **Save**
4. Your app will be live at: `https://YOUR_USERNAME.github.io/the-table/`

---

## Step 7 — Configure Supabase Auth Redirect

1. In Supabase → **Authentication** → **URL Configuration**
2. Set **Site URL** to your GitHub Pages URL: `https://YOUR_USERNAME.github.io/the-table/`
3. Add to **Redirect URLs**: `https://YOUR_USERNAME.github.io/the-table/`

---

## Step 8 — Install on iPhone (PWA)

1. Open Safari on your iPhone
2. Navigate to `https://YOUR_USERNAME.github.io/the-table/`
3. Tap the **Share** button (box with arrow) → **Add to Home Screen**
4. Name it "The Table" → **Add**
5. It will appear on your home screen like a native app ✓

---

## Features

| Feature | Details |
|---------|---------|
| 🔐 Auth | Email/password sign-up and sign-in via Supabase |
| 🍽 My Journal | Add restaurants with star ratings across 5 dimensions |
| 🔍 Search | Live restaurant lookup via OpenStreetMap Nominatim |
| 🥘 Dishes | Log dishes with 1–10 ratings and tasting notes |
| 🗺 Map | All restaurants plotted on an interactive map |
| 📍 Near Me | GPS-based "nearest restaurant" feature |
| 🌍 Community | Browse public entries from all users |
| 📱 PWA | Installable on iPhone, works offline for cached pages |
| 🔒 Privacy | Each user owns their data; public sharing is opt-in per entry |

---

## Project Structure

```
the-table/
├── index.html          ← Main app shell
├── manifest.json       ← PWA manifest
├── sw.js               ← Service worker (offline support)
├── supabase_schema.sql ← Run this in Supabase SQL Editor
├── css/
│   └── style.css       ← All styles
├── js/
│   ├── app.js          ← Main UI logic
│   ├── auth.js         ← Supabase auth (add your keys here)
│   ├── db.js           ← Database operations
│   └── map.js          ← Leaflet map integration
└── icons/
    ├── icon-192.png    ← Add these yourself
    └── icon-512.png
```

---

## Updating the App

After making changes:
```bash
git add .
git commit -m "Update"
git push
```
GitHub Pages will redeploy automatically within ~60 seconds.
