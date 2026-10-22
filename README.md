# Manga Tracker

A small web app for keeping track of a manga collection: which volumes you own and which ones you've read.

Live at **https://zbiboo.github.io/manga-tracker/**

## Features

- **Inventory view**: tick the volumes you own in each series.
- **Reading view**: tick the owned volumes you've read. You can filter to series that still have unread volumes.
- **Missing view**: list the volumes missing from each series.
- **Barcode scanner**: scan the ISBN on a back cover to add a volume. The title is looked up on Google Books, the BnF catalogue and Open Library. Scanning needs a browser that supports `BarcodeDetector`, such as Chrome on Android.
- **Covers**: series covers are found by name. You can also find all missing covers at once, or remove or change a cover.
- **Cloud sync**: log in with an emailed link to sync your collection across devices.
- **Backup**: export or import your collection as a JSON file.

Your data is always saved in the browser (`localStorage`), so the app works without logging in.

## Files

| File         | Contents                                   |
|--------------|--------------------------------------------|
| `index.html` | Page layout                                |
| `styles.css` | Styles, light and dark themes              |
| `app.js`     | App logic: rendering, sync, scanner, lookups, covers |

There's no build step and no dependencies to install. Supabase's JS client and the Google font load from CDNs.

## Running locally

Serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk works for local use. Login links redirect back to the page's address, though, so to test syncing, use a served URL that is allowed in Supabase's auth settings.

## Deploying

The site is published with GitHub Pages from the `main` branch. Push to `main` and the live site updates.

## Cloud sync setup (Supabase)

The Supabase project URL and publishable key are at the top of `app.js`. The publishable key is designed to be public. Access is protected by row-level security.

Sync uses one table. Each user gets one row, holding their whole collection as JSON:

```sql
create table collections (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null
);

alter table collections enable row level security;

create policy "Own collection only" on collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

When the app syncs, the newer copy wins, decided by `updated_at`. Before replacing local data with the cloud copy, the app saves the local data to `localStorage` under `manga_before_sync`.
