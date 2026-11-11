# Server modules

## What runs

Browser page at port 3000
→ analytics API at port 5000 (existing TypeScript service)
→ local account/data API at 127.0.0.1:5100 (JavaScript)
→ native MongoDB at 127.0.0.1:27017

The browser never connects directly to MongoDB. The local-data API is the only path for user accounts and owned datasets. MongoDB runs as a native Windows service; this workflow does not use Docker.

## Start locally

From the project directory:

    npm ci
    if (-not (Test-Path .env)) { Copy-Item .env.example .env }
    Get-Service MongoDB
    npm run dev:all

The local project setup uses MongoDB Community Server as a native Windows service. Confirm it with `Get-Service MongoDB`; if absent, install MongoDB Community Server from MongoDB's official Windows instructions and select the Windows Service option with Automatic startup. The local API connects to `mongodb://127.0.0.1:27017/cancer_explorer`.

Open:


- User entry point (register/login and analysis workspace): http://127.0.0.1:3000/
- Embedded local account and dataset workbench: open **Dữ liệu & MongoDB** from the root page; URL remains `/`
- Cached offline workbench entry: http://127.0.0.1:3000/database.html. When the main app is reachable, this opens its embedded importer.
- Local-data API health: http://127.0.0.1:5100/api/health

npm run dev:all keeps Vite and both Node APIs active only while that command is running. MongoDB's Windows service can start automatically with Windows, but the Node/Vite processes still need npm run dev:all after a reboot. If MongoDB stops, the local-data API reports mongoConnected=false and rejects server writes; the browser keeps queued data in IndexedDB.

## Native MongoDB configuration

.env values:

- MONGODB_URI: MongoDB connection string; default local URI is mongodb://127.0.0.1:27017/cancer_explorer.
- MONGODB_DB_NAME: database name; defaults to cancer_explorer.
- LOCAL_DATA_PORT: local API port; defaults to 5100.
.env.example contains no real credentials. Local account registration does not use SMTP. Email is a login identifier and is not verified by this local-only mode.

## New collections for the local workbench

| Collection | Contents |
|---|---|
| users | User ID, normalized email, required full name, local auth mode, unverified-email flag, role, active status, scrypt password hash/salt and timestamps. Plaintext passwords are never stored. |
| sessions | SHA-256 session token hash, user ID and expiry; cookie token is HttpOnly, SameSite=Strict. |
| user_datasets | Dataset metadata, ownerId, revision, row count and sync state. |
| user_dataset_rows | Existing rows keyed by owner, dataset and record ID. Legacy datasets read from this collection until the first new sync. |
| user_dataset_revision_rows | Uploaded and published rows keyed by owner, dataset, sync ID and record ID. An index on row index supports cursor pagination. |
| user_dataset_row_edits | Online edits keyed by owner, dataset, row generation, record ID and edit revision. |
| dataset_versions | Metadata manifest for completed sync revisions. |
| dataset_sync_receipts | Completed sync acknowledgements for replay after the current revision advances. |
| dataset_conflicts | Conflict header with archived server revision and row count. |
| dataset_conflict_rows | Server row snapshots retained before offline-wins replacement. |
| user_experiments | Account-scoped analysis history with a dataset revision reference. |

The existing analytics service still uses its older datasets, experiments, and compute_cache collections. The new page does not silently treat those legacy demo datasets as user-owned rows.

## Local account authentication

Registration sequence:

1. User enters a full name, email, and password.
2. The API validates a full name with at least two name parts and a password of at least 14 characters, with uppercase, lowercase, number, and symbol. Common words and long repeated-character sequences are rejected.
3. The API stores a scrypt password hash with a random salt and creates the account in MongoDB immediately.
4. The API sets an HttpOnly, SameSite=Strict session cookie. MongoDB stores only the SHA-256 hash of the session token.

The email address is a login identifier only; the account has `emailVerified: false`. This local mode is intended for the loopback API, not public or multi-user deployment. If MongoDB or the API is unavailable, the browser-only offline workspace can still store data in IndexedDB; the user can create a MongoDB account after the local service is available.

## Dataset import, update, and synchronization

- Browser reads CSV as a byte stream and writes rows in IndexedDB batches of 250.
- recordId is generated once per source row (row_0, row_1, …) and preserved when that local dataset is synchronized.
- The API accepts at most 500 rows per request and stores each row separately. It does not place all rows in one Mongo document.
- Replacing a selected dataset imports a new dataset ID locally and queues removal of the old dataset only after the replacement is queued.
- The browser persists the sync ID before sending sync/start, row batches, then sync/finish. The standalone MongoDB server publishes the complete row generation through a conditional update to one dataset document.
- A stale base revision archives the current server dataset before publication. A future base revision returns `409` and the browser retains its copy.
- A failed or interrupted sync leaves the browser copy pending. Replaying a completed sync ID returns the same revision. A different sync ID can replace an incomplete upload for the same dataset.
- Explore pages through a completed revision and processes private data in the browser. Private experiments are saved through the local-data API.

MongoDB limits an individual BSON document to 16 MiB. One document per row avoids storing an entire CSV in a single document, but does not remove disk, index, browser quota, or compute-memory limits. The workbench reports IndexedDB quota errors; very large datasets may need a dedicated object store and server-side streaming import in a later phase.

## API endpoints

All /api/* mutations require the local client header and are reachable only through loopback origins.

| Method | Endpoint | Use |
|---|---|---|
| GET | /api/health | Local API, Mongo ping, latency and registration mode |
| POST | /api/auth/register | Create a local account and start a session |
| POST | /api/auth/register/start | Compatibility alias for local account creation |
| POST | /api/auth/login | Sign in local or previously email-verified user |
| GET | /api/auth/me | Read authenticated user |
| POST | /api/auth/logout | Revoke current session |
| GET | /api/datasets | List only the authenticated user's datasets |
| POST | /api/datasets/sync/start | Start/retry a revisioned sync |
| POST | /api/datasets/:id/rows/batch | Upsert a batch of up to 500 rows |
| POST | /api/datasets/:id/sync/finish | Check row count and finish a sync |
| GET | /api/datasets/:id/rows | Page through source records |
| GET | /api/datasets/:id/conflicts | List preserved server versions |
| GET | /api/datasets/:id/conflicts/:conflictId/rows | Page through archived rows |
| PATCH | /api/datasets/:id | Rename dataset |
| PATCH | /api/datasets/:id/rows/:recordId | Update one server-side row |
| DELETE | /api/datasets/:id | Delete one dataset owned by the session user |
| GET | /api/experiments | List experiments for the local session user |
| POST | /api/experiments | Save an experiment for the current published dataset revision |

## Limits and security boundary

- Native MongoDB should bind only to 127.0.0.1; the new API also binds only to 127.0.0.1.
- MONGODB_URI may include credentials, so do not print it in logs or documentation.
- The browser caches CSV values in IndexedDB as plaintext within the current browser profile. Windows account access is the local security boundary.
- This feature does not install MongoDB, configure SMTP provider credentials, run Node/Vite as an OS service, create cloud backup, or expose access to other devices.
- The TypeScript analysis API serves the legacy demo flow. The JavaScript local-data API provides account-scoped CSV and experiment storage for the workbench and Explore.

## Compatibility checks

Use a MongoDB instance dedicated to tests and specify its loopback port in `LOCAL_SYNC_TEST_MONGODB_URI`. Run `npm run test:local-db`. To inventory an existing installation, set `MONGODB_INVENTORY_URI` and run `npm run inventory:local-db`. The inventory prints collection counts, index definitions and sampled BSON types.

