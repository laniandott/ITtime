# ITtime Project Status

This repository contains the ITtime application.

## Working migration slice

- Bottom navigation: check-in, todos, habits, statistics, settings.
- Tag settings own goal definitions. Todos show pending activities; habits show period results and completed activities. Statistics uses local timer records with per-project cumulative durations.
- Settings has working tag/category management and CouchDB connection test/start/stop controls.
- Categories, tags, todos, timer records, goals and memo JSON are stored in browser IndexedDB through PouchDB.
- Timer entries have independent IDs, supporting simultaneous activities. Stopping a tag persists its record and displays a local-save confirmation.
- CouchDB live replication is wired to the local PouchDB database. Configure an existing database and an account authorized for it; HTTPS and matching CORS are required for cross-origin use.
- Settings can export all SQLite-backed core records to PouchDB while preserving IDs; repeated imports skip existing IDs rather than overwriting local data.

## Outstanding before production

- SQLite-backed core data is not imported automatically. Use Settings → Data Migration after deployment; keep a server backup before importing.
- Conflict resolution and cross-device timer behavior require design and actual CouchDB tests. Basic replication alone does not guarantee application-level merge correctness.
- Calendar HTTP endpoints and file uploads still use the original server. Their data source has NOT been migrated. The new statistics page reads PouchDB but advanced historical charts and fragmentation analysis remain pending.
- Complex termination chains, recurring activities, attachment storage, validation parity and full goal periods need migration. Unsupported termination currently returns an error rather than success.
- Credential protection, offline app-shell caching, desktop/mobile browser screenshots and interaction tests remain outstanding.
- Dockerfile builds the Prisma server and serves the built SPA from `/apps/web/dist`; the SQLite volume remains for calendar, notes and upload endpoints that still use the server.
- Dependency audit currently reports vulnerabilities inherited from the ITtime dependency graph; review before deployment.

## Preview

Run `npm run dev:web -- --host 127.0.0.1` from this checkout. Local core workflows do not require the Prisma server. Development default is http://localhost:5173 (Vite selects a different port if occupied).

## Verification

`npm run build -w apps/web`

`npm run test -w apps/web`

`node --import tsx --test apps/web/test/localData.test.ts`
