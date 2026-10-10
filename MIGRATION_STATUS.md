# ITtime Project Status

This repository contains the ITtime application.

## Working migration slice

- Bottom navigation: check-in, todos, habits, statistics, calendar, settings.
- Tag settings own goal definitions. Todos show pending activities; habits show period results and completed activities. Statistics uses local timer records with per-project cumulative durations.
- Settings has working tag/category management and CouchDB connection test/start/stop controls.
- Categories, tags, todos, timer records, goals and memo JSON are stored in browser IndexedDB through PouchDB.
- Timer entries have independent IDs, supporting simultaneous activities. Stopping a tag persists its record and displays a local-save confirmation.
- CouchDB live replication is wired to the local PouchDB database. Conflict branches merge per field using field update timestamps; same-field ties resolve deterministically, and independent concurrent calls to the resolver are serialized per local database. Configure an existing database and an account authorized for it; HTTPS and matching CORS are required for cross-origin use.
- Settings can export all SQLite-backed core records to PouchDB while preserving IDs; repeated imports skip existing IDs rather than overwriting local data.
- Sync settings count active records and logical-deletion markers separately before testing/starting. An empty local database with active cloud documents is reported as cloud recovery; local records with an empty cloud database are reported as upload; two populated sides are reported as bidirectional merge. A database containing only deletion markers is explicitly reported as having no visible records, rather than a fresh empty dataset.
- Calendar month view uses a compact full-month grid with day details in a popup. Previously loaded external calendar ranges are cached in a separate local PouchDB database and remain visible offline; this cache is device-local and is not replicated to CouchDB.

## Outstanding before production

- SQLite-backed core data is not imported automatically. Use Settings → Data Migration after deployment; keep a server backup before importing.
- Conflict resolution has unit coverage using two independent PouchDB replicas, including independent field edits, same-field conflicts, deletion ties, logical deletion versus offline edits and concurrent resolver calls. Local deletes use replicated tombstones and are hidden from normal reads. A real CouchDB instance is still needed to validate HTTP replication, authentication, CORS and live reconnect behavior.
- External calendar subscriptions and ICS fetching still use the original server. The calendar UI reads core timer, memo and todo data from local PouchDB; cached external event snapshots are device-local only. Calendar subscription configuration and fetched events are not yet replicated across devices. File uploads still use the original server. The new statistics page reads PouchDB but advanced historical charts and fragmentation analysis remain pending.
- Recurring activities, attachment storage, validation parity and full goal periods still need migration. Local termination chains now preserve history while marking the whole interrupted chain dismissed; exact server validation limits should still be aligned before production.
- Credential protection, offline app-shell caching, desktop/mobile browser screenshots and interaction tests remain outstanding.
- Dockerfile builds the Prisma server and serves the built SPA from `/apps/web/dist`; the SQLite volume remains for calendar, notes and upload endpoints that still use the server.
- Dependency audit currently reports vulnerabilities inherited from the ITtime dependency graph; review before deployment.

## Preview

Run `npm run dev:web -- --host 127.0.0.1` from this checkout. Local core workflows do not require the Prisma server. Development default is http://localhost:5173 (Vite selects a different port if occupied).

## Verification

`npm run build -w apps/web`

`npm run test -w apps/web`

`node --import tsx --test apps/web/test/localData.test.ts`
