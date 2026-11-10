# Google sign-in and dataset storage

## Run locally

1. Copy `.env.example` to the project root as `.env`. Use Node 22 or later and run `npm ci`.
2. Use `LAB_STORAGE_MODE=demo` for sample datasets and RAM uploads. Demo credentials never provide access to Atlas. Demo data lasts until restart.
3. For persistent development, set `LAB_STORAGE_MODE=atlas`, `MONGODB_URI`, and `MONGODB_DB=dimension_lab_dev` (or another explicitly assigned dev database). Use a database user scoped to that database and allow the dev machine to connect.
4. Create a Google OAuth client of type **Web application**. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI`. Register exactly `http://localhost:3000/api/auth/google/callback` as the local redirect URI and add your tester accounts if required by the Google consent configuration. Start the app with `npm run dev:all` and open `http://localhost:3000/`. Vite proxies `/api` to Express at `127.0.0.1:5000`. Use the registered host and port throughout sign-in and sign-out.
5. For HTTPS, set the redirect URI to the public HTTPS origin with the same callback path, and serve the frontend and API under that origin. The session cookie is Secure when configured for HTTPS. Cookie-authenticated writes require the configured origin. Keep the client secret and connection string in server configuration.

After Atlas initialization fails, health and persistent operations report unavailability until the next successful startup. Restart after fixing the database configuration. Verify health with `GET /api/health`.

## Inspect in Compass

Connect to the dev cluster and select the value of `MONGODB_DB`.

- In `users`, locate the Google account by `googleSub`. Sign in twice and check for one document with the same `_id` and an updated `lastLoginAt`. The server assigns `researcher` to new accounts.
- In `sessions`, match `userId` to that `_id`. Check `expiresAt` and the TTL index. `tokenHash` is the hash of the app session cookie. Logout removes its session.
- In `datasets`, match `ownerId` to the same user and use `currentVersionId` to find the document in `dataset_versions`. Compare `rowCount` with Explore. The version's `fileId` corresponds to `dataset_files.files._id` and `dataset_files.chunks.files_id`.
- Verify persistence by uploading a small CSV with account A, restarting Express, reloading the browser, opening Explore and downloading the original CSV. Compare the downloaded bytes with the upload. With account B, check that the list excludes A's dataset and that detail, preview, download, rename and delete return 404 for A's ID.

`GET /api/datasets?offset=0&limit=50` returns metadata, with `X-Next-Offset` when more records exist. The preview endpoint returns up to 20 rows. Explore uses the detail endpoint to load the full dataset for analysis. The download endpoint streams the original file.

## Legacy inventory and migration

The app opens the configured dev database and only exposes published records with an ObjectId owner and version reference. Existing data in `cancer_explorer` stays in place. Use a separately approved read-only connection via `LEGACY_MONGODB_URI`, then run `node scripts/inventory-legacy-mongo.mjs` to count legacy datasets and experiments without printing record content. An ObjectId on a legacy record is only a candidate until it has been matched to an approved account.

For a dev migration, copy a small verified subset. Match owners using a reviewed mapping to new user IDs. Import the original CSV through the upload workflow and record the old-to-new dataset IDs. Migrate an experiment only when both its dataset and owner have verified mappings. Reconstructed CSV from legacy rows may differ from the original bytes, so document provenance before importing it. Keep unmatched data in the restricted legacy database. Plan any production migration separately after verifying ownership, row counts, downloads and rollback on dev.

## Failed uploads and deleted files

An upload is visible only after GridFS and its version are stored and the dataset document has been published. A publication timeout may mean the write committed. Files are retained for reconciliation in that case. Dataset deletion sets `deletedAt` and revokes access immediately.

For dev cleanup, stop writes and take a backup. Compare `datasets.currentVersionId`, `dataset_versions._id`, and `dataset_files.files._id`. For an old unreferenced file or a tombstoned dataset whose retention period has ended, verify that no live dataset version uses the file ID before removing it with the MongoDB driver's `GridFSBucket.delete(fileId)`. Remove the orphan version only after file cleanup succeeds. For incomplete uploads with chunks but no file document, verify the same absence of references and remove only chunks with the confirmed orphan `files_id`. Keep a record of the IDs processed.

## References

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [openid-client authorization code checks](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md)
- [MongoDB GridFS](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/)
- [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)
